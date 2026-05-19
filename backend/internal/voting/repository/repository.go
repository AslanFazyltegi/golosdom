package repository

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"golosdom-backend/internal/voting/model"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	db *pgxpool.Pool
}

func New(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

func (r *Repository) List(ctx context.Context, status string) ([]model.Voting, error) {
	if err := r.syncReviewStatuses(ctx); err != nil {
		return nil, err
	}

	rows, err := r.db.Query(ctx, `
		SELECT v.id, v.title, v.description, v.status, v.created_by,
		       v.meeting_id::text, COALESCE(v.version, 1), v.review_deadline, v.created_at, v.updated_at,
		       m.id::text, m.initiator_name, m.scheduled_at, m.location, m.agenda, m.meeting_form
		FROM votings v
		LEFT JOIN meetings m ON m.id = v.meeting_id
		WHERE ($1 = '' OR v.status = $1)
		ORDER BY COALESCE(v.updated_at, v.created_at) DESC
	`, status)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	votings := []model.Voting{}
	for rows.Next() {
		voting, err := scanVoting(rows)
		if err != nil {
			return nil, err
		}

		questions, err := r.getQuestions(ctx, voting.ID)
		if err != nil {
			return nil, err
		}

		voting.Questions = questions
		votings = append(votings, voting)
	}

	return votings, rows.Err()
}

func (r *Repository) Get(ctx context.Context, id string) (model.Voting, error) {
	if err := r.syncReviewStatuses(ctx); err != nil {
		return model.Voting{}, err
	}

	row := r.db.QueryRow(ctx, `
		SELECT v.id, v.title, v.description, v.status, v.created_by,
		       v.meeting_id::text, COALESCE(v.version, 1), v.review_deadline, v.created_at, v.updated_at,
		       m.id::text, m.initiator_name, m.scheduled_at, m.location, m.agenda, m.meeting_form
		FROM votings v
		LEFT JOIN meetings m ON m.id = v.meeting_id
		WHERE v.id = $1
	`, id)

	voting, err := scanVoting(row)
	if err != nil {
		return model.Voting{}, err
	}

	questions, err := r.getQuestions(ctx, voting.ID)
	if err != nil {
		return model.Voting{}, err
	}
	voting.Questions = questions

	return voting, nil
}

func (r *Repository) SaveDraft(ctx context.Context, voting model.Voting) error {
	return r.saveVoting(ctx, voting, model.StatusDraft)
}

func (r *Repository) UpdateDraft(ctx context.Context, voting model.Voting) error {
	status := voting.Status
	if status == "" {
		status = model.StatusDraft
	}
	return r.saveVoting(ctx, voting, status)
}

func (r *Repository) Delete(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM votings WHERE id = $1 AND status IN ('draft', 'revision_required')`, id)
	return err
}

func (r *Repository) SubmitToCouncil(ctx context.Context, id string, version int, deadline time.Time) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx, `
		UPDATE votings
		SET status = $2, version = $3, review_deadline = $4, updated_at = now()
		WHERE id = $1
	`, id, model.StatusCouncilReview, version, deadline)
	if err != nil {
		return err
	}

	reviewID := fmt.Sprintf("%s-review-v%d-%d", id, version, time.Now().UnixNano())
	_, err = tx.Exec(ctx, `
		INSERT INTO voting_approval_reviews (id, voting_id, version, status, deadline)
		VALUES ($1, $2, $3, $4, $5)
	`, reviewID, id, version, model.ReviewInProgress, deadline)
	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}

func (r *Repository) CurrentApproval(ctx context.Context, votingID string) (model.ApprovalReview, error) {
	if err := r.FinalizeApprovalIfMajorityReached(ctx, votingID); err != nil {
		return model.ApprovalReview{}, err
	}
	if err := r.MarkExpiredReviews(ctx); err != nil {
		return model.ApprovalReview{}, err
	}

	return r.loadCurrentApproval(ctx, votingID)
}

func (r *Repository) loadCurrentApproval(ctx context.Context, votingID string) (model.ApprovalReview, error) {
	row := r.db.QueryRow(ctx, `
		SELECT id, voting_id, version, status, deadline, created_at, updated_at
		FROM voting_approval_reviews
		WHERE voting_id = $1
		ORDER BY version DESC, created_at DESC
		LIMIT 1
	`, votingID)

	review, err := scanReview(row)
	if err != nil {
		return model.ApprovalReview{}, err
	}

	return r.hydrateReview(ctx, review)
}

func (r *Repository) Vote(ctx context.Context, review model.ApprovalReview, vote model.ApprovalVote) (model.ApprovalReview, error) {
	var exists string
	err := r.db.QueryRow(ctx, `
		SELECT id FROM voting_approval_votes WHERE review_id = $1 AND user_id = $2
	`, review.ID, vote.UserID).Scan(&exists)
	if err == nil {
		return r.CurrentApproval(ctx, vote.VotingID)
	}
	if err != pgx.ErrNoRows {
		return model.ApprovalReview{}, err
	}

	_, err = r.db.Exec(ctx, `
		INSERT INTO voting_approval_votes (id, review_id, voting_id, user_id, decision, comment, reason)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`, vote.ID, vote.ReviewID, vote.VotingID, vote.UserID, vote.Decision, vote.Comment, vote.Reason)
	if err != nil {
		if isUniqueViolation(err) {
			return r.CurrentApproval(ctx, vote.VotingID)
		}
		return model.ApprovalReview{}, err
	}

	return r.RecalculateApproval(ctx, review.ID)
}

func (r *Repository) RecalculateApproval(ctx context.Context, reviewID string) (model.ApprovalReview, error) {
	review, err := r.getReviewByID(ctx, reviewID)
	if err != nil {
		return model.ApprovalReview{}, err
	}

	review, err = r.hydrateReview(ctx, review)
	if err != nil {
		return model.ApprovalReview{}, err
	}

	status := model.ReviewInProgress
	votingStatus := model.StatusCouncilReview

	majority := majorityThreshold(review.TotalCouncilMembers)
	if review.ApproveCount >= majority {
		status = model.ReviewApproved
		votingStatus = model.StatusPendingPublish
	} else if review.RevisionCount >= majority {
		status = model.ReviewRevision
		votingStatus = model.StatusRevisionRequired
	}

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return model.ApprovalReview{}, err
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx, `
		UPDATE voting_approval_reviews
		SET status = $2, updated_at = now()
		WHERE id = $1
	`, review.ID, status)
	if err != nil {
		return model.ApprovalReview{}, err
	}

	_, err = tx.Exec(ctx, `
		UPDATE votings
		SET status = $2, updated_at = now()
		WHERE id = $1
	`, review.VotingID, votingStatus)
	if err != nil {
		return model.ApprovalReview{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return model.ApprovalReview{}, err
	}

	return r.loadCurrentApproval(ctx, review.VotingID)
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}

func majorityThreshold(totalCouncilMembers int) int {
	return totalCouncilMembers/2 + 1
}

func (r *Repository) syncReviewStatuses(ctx context.Context) error {
	if err := r.FinalizeApprovalsIfMajorityReached(ctx); err != nil {
		return err
	}
	return r.MarkExpiredReviews(ctx)
}

func (r *Repository) FinalizeApprovalIfMajorityReached(ctx context.Context, votingID string) error {
	total, err := r.CouncilMemberCount(ctx)
	if err != nil {
		return err
	}
	majority := majorityThreshold(total)

	var reviewID string
	err = r.db.QueryRow(ctx, `
		SELECT ar.id
		FROM voting_approval_reviews ar
		JOIN votings v ON v.id = ar.voting_id
		LEFT JOIN voting_approval_votes av ON av.review_id = ar.id
		WHERE ar.voting_id = $1
		  AND v.status = $2
		  AND ar.status = $3
		  AND ar.id = (
		    SELECT latest.id
		    FROM voting_approval_reviews latest
		    WHERE latest.voting_id = ar.voting_id
		    ORDER BY latest.version DESC, latest.created_at DESC
		    LIMIT 1
		  )
		GROUP BY ar.id
		HAVING COUNT(*) FILTER (WHERE av.decision = $4) >= $6
		    OR COUNT(*) FILTER (WHERE av.decision = $5) >= $6
	`, votingID, model.StatusCouncilReview, model.ReviewInProgress, model.DecisionApprove, model.DecisionRevision, majority).Scan(&reviewID)
	if err == pgx.ErrNoRows {
		return nil
	}
	if err != nil {
		return err
	}

	_, err = r.RecalculateApproval(ctx, reviewID)
	return err
}

func (r *Repository) FinalizeApprovalsIfMajorityReached(ctx context.Context) error {
	total, err := r.CouncilMemberCount(ctx)
	if err != nil {
		return err
	}
	majority := majorityThreshold(total)

	rows, err := r.db.Query(ctx, `
		SELECT ar.id
		FROM voting_approval_reviews ar
		JOIN votings v ON v.id = ar.voting_id
		LEFT JOIN voting_approval_votes av ON av.review_id = ar.id
		WHERE v.status = $1
		  AND ar.status = $2
		  AND ar.id = (
		    SELECT latest.id
		    FROM voting_approval_reviews latest
		    WHERE latest.voting_id = ar.voting_id
		    ORDER BY latest.version DESC, latest.created_at DESC
		    LIMIT 1
		  )
		GROUP BY ar.id
		HAVING COUNT(*) FILTER (WHERE av.decision = $3) >= $5
		    OR COUNT(*) FILTER (WHERE av.decision = $4) >= $5
	`, model.StatusCouncilReview, model.ReviewInProgress, model.DecisionApprove, model.DecisionRevision, majority)
	if err != nil {
		return err
	}
	defer rows.Close()

	reviewIDs := []string{}
	for rows.Next() {
		var reviewID string
		if err := rows.Scan(&reviewID); err != nil {
			return err
		}
		reviewIDs = append(reviewIDs, reviewID)
	}
	if err := rows.Err(); err != nil {
		return err
	}

	for _, reviewID := range reviewIDs {
		if _, err := r.RecalculateApproval(ctx, reviewID); err != nil {
			return err
		}
	}

	return nil
}

func (r *Repository) MarkExpiredReviews(ctx context.Context) error {
	_, err := r.db.Exec(ctx, `
		WITH expired AS (
			UPDATE voting_approval_reviews
			SET status = 'no_majority', updated_at = now()
			WHERE status = 'in_progress' AND deadline < now()
			RETURNING voting_id
		)
		UPDATE votings
		SET status = 'revision_required', updated_at = now()
		WHERE id IN (SELECT voting_id FROM expired)
	`)
	return err
}

func (r *Repository) CouncilMemberCount(ctx context.Context) (int, error) {
	var count int
	err := r.db.QueryRow(ctx, `
		SELECT COUNT(DISTINCT ur.user_id)
		FROM user_roles ur
		JOIN roles r ON r.id = ur.role_id
		WHERE r.code IN ('COUNCIL_MEMBER', 'CHAIRMAN')
	`).Scan(&count)
	return count, err
}

func (r *Repository) saveVoting(ctx context.Context, voting model.Voting, status string) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx, `
		INSERT INTO votings (id, title, description, status, created_by, meeting_id, version, review_deadline, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6::uuid, $7, $8, now())
		ON CONFLICT (id) DO UPDATE
		SET title = EXCLUDED.title,
		    description = EXCLUDED.description,
		    status = EXCLUDED.status,
		    meeting_id = EXCLUDED.meeting_id,
		    version = EXCLUDED.version,
		    review_deadline = EXCLUDED.review_deadline,
		    updated_at = now()
	`, voting.ID, voting.Title, voting.Description, status, voting.CreatedBy, voting.MeetingID, voting.Version, voting.ReviewDeadline)
	if err != nil {
		return err
	}

	_, err = tx.Exec(ctx, `
		DELETE FROM voting_options
		WHERE question_id IN (SELECT id FROM voting_questions WHERE voting_id = $1)
	`, voting.ID)
	if err != nil {
		return err
	}

	_, err = tx.Exec(ctx, `DELETE FROM voting_questions WHERE voting_id = $1`, voting.ID)
	if err != nil {
		return err
	}

	for i, q := range voting.Questions {
		questionID := q.ID
		if questionID == "" {
			questionID = fmt.Sprintf("%s-question-%d", voting.ID, i+1)
		}

		_, err = tx.Exec(ctx, `
			INSERT INTO voting_questions (id, voting_id, text)
			VALUES ($1, $2, $3)
		`, questionID, voting.ID, q.Text)
		if err != nil {
			return err
		}

		for j, option := range q.Options {
			optionID := fmt.Sprintf("%s-option-%d", questionID, j+1)
			_, err = tx.Exec(ctx, `
				INSERT INTO voting_options (id, question_id, text)
				VALUES ($1, $2, $3)
			`, optionID, questionID, option)
			if err != nil {
				return err
			}
		}
	}

	return tx.Commit(ctx)
}

func (r *Repository) getQuestions(ctx context.Context, votingID string) ([]model.Question, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, text
		FROM voting_questions
		WHERE voting_id = $1
		ORDER BY created_at ASC
	`, votingID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	questions := []model.Question{}
	for rows.Next() {
		var q model.Question
		if err := rows.Scan(&q.ID, &q.Text); err != nil {
			return nil, err
		}

		options, err := r.getOptions(ctx, q.ID)
		if err != nil {
			return nil, err
		}

		q.Options = options
		questions = append(questions, q)
	}

	return questions, rows.Err()
}

func (r *Repository) getOptions(ctx context.Context, questionID string) ([]string, error) {
	rows, err := r.db.Query(ctx, `
		SELECT text
		FROM voting_options
		WHERE question_id = $1
		ORDER BY created_at ASC
	`, questionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	options := []string{}
	for rows.Next() {
		var option string
		if err := rows.Scan(&option); err != nil {
			return nil, err
		}
		options = append(options, option)
	}

	return options, rows.Err()
}

func (r *Repository) hydrateReview(ctx context.Context, review model.ApprovalReview) (model.ApprovalReview, error) {
	count, err := r.CouncilMemberCount(ctx)
	if err != nil {
		return model.ApprovalReview{}, err
	}
	review.TotalCouncilMembers = count
	review.Votes = []model.ApprovalVote{}

	rows, err := r.db.Query(ctx, `
		SELECT id, review_id, voting_id, user_id, decision, COALESCE(comment, ''), COALESCE(reason, ''), created_at, updated_at
		FROM voting_approval_votes
		WHERE review_id = $1
		ORDER BY created_at ASC
	`, review.ID)
	if err != nil {
		return model.ApprovalReview{}, err
	}
	defer rows.Close()

	for rows.Next() {
		var vote model.ApprovalVote
		if err := rows.Scan(&vote.ID, &vote.ReviewID, &vote.VotingID, &vote.UserID, &vote.Decision, &vote.Comment, &vote.Reason, &vote.CreatedAt, &vote.UpdatedAt); err != nil {
			return model.ApprovalReview{}, err
		}
		if vote.Decision == model.DecisionApprove {
			review.ApproveCount++
		}
		if vote.Decision == model.DecisionRevision {
			review.RevisionCount++
		}
		review.Votes = append(review.Votes, vote)
	}
	if err := rows.Err(); err != nil {
		return model.ApprovalReview{}, err
	}

	review.PendingCouncilMembers = review.TotalCouncilMembers - review.ApproveCount - review.RevisionCount
	if review.PendingCouncilMembers < 0 {
		review.PendingCouncilMembers = 0
	}
	if review.Status == model.ReviewNoMajority {
		review.NoMajorityReason = model.NoMajorityExplanation
	}

	return review, nil
}

func (r *Repository) getReviewByID(ctx context.Context, id string) (model.ApprovalReview, error) {
	row := r.db.QueryRow(ctx, `
		SELECT id, voting_id, version, status, deadline, created_at, updated_at
		FROM voting_approval_reviews
		WHERE id = $1
	`, id)
	return scanReview(row)
}

type rowScanner interface {
	Scan(dest ...any) error
}

func scanVoting(row rowScanner) (model.Voting, error) {
	var voting model.Voting
	var meetingID *string
	var reviewDeadline *time.Time
	var createdAt *time.Time
	var updatedAt *time.Time
	var joinedMeetingID *string
	var initiatorName *string
	var scheduledAt *time.Time
	var location *string
	var agendaRaw []byte
	var meetingForm *string

	err := row.Scan(
		&voting.ID,
		&voting.Title,
		&voting.Description,
		&voting.Status,
		&voting.CreatedBy,
		&meetingID,
		&voting.Version,
		&reviewDeadline,
		&createdAt,
		&updatedAt,
		&joinedMeetingID,
		&initiatorName,
		&scheduledAt,
		&location,
		&agendaRaw,
		&meetingForm,
	)
	if err != nil {
		return model.Voting{}, err
	}

	voting.MeetingID = meetingID
	voting.ReviewDeadline = reviewDeadline
	voting.CreatedAt = createdAt
	voting.UpdatedAt = updatedAt

	if joinedMeetingID != nil && scheduledAt != nil {
		meeting := &model.Meeting{
			ID:          *joinedMeetingID,
			ScheduledAt: *scheduledAt,
		}
		if initiatorName != nil {
			meeting.InitiatorName = *initiatorName
		}
		if location != nil {
			meeting.Location = *location
		}
		if meetingForm != nil {
			meeting.MeetingForm = *meetingForm
		}
		if len(agendaRaw) > 0 {
			_ = json.Unmarshal(agendaRaw, &meeting.Agenda)
		}
		voting.Meeting = meeting
	}

	return voting, nil
}

func scanReview(row rowScanner) (model.ApprovalReview, error) {
	var review model.ApprovalReview
	err := row.Scan(&review.ID, &review.VotingID, &review.Version, &review.Status, &review.Deadline, &review.CreatedAt, &review.UpdatedAt)
	return review, err
}
