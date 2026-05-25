package repository

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"golosdom-backend/internal/common/datetime"
	"golosdom-backend/internal/voting/model"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	db *pgxpool.Pool
}

var ErrOwnerAlreadyVoted = errors.New("owner already voted")

func New(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

func (r *Repository) List(ctx context.Context, status, userID string) ([]model.Voting, error) {
	if err := r.syncReviewStatuses(ctx); err != nil {
		return nil, err
	}

	rows, err := r.db.Query(ctx, `
		SELECT v.id, v.title, v.description, v.status, v.created_by,
		       v.meeting_id::text, COALESCE(v.version, 1), v.review_deadline,
		       v.publication_start_at, v.publication_end_at,
		       COALESCE(v.publication_send_notifications, false),
		       v.publication_scheduled_at,
		       COALESCE(v.publication_status, 'not_scheduled'),
		       v.published_at, v.min_stop_at, v.stopped_at, v.completed_at, v.expired_at,
		       v.created_at, v.updated_at,
		       m.id::text, m.initiator_name, m.scheduled_at, m.location, m.agenda, m.meeting_form
		FROM votings v
		LEFT JOIN meetings m ON m.id = v.meeting_id
		WHERE (
		  $1 = ''
		  OR ($1 = 'published' AND v.status IN ('published', 'stopped', 'completed', 'expired'))
		  OR (
		    $1 = 'active'
		    AND v.status = 'published'
		    AND COALESCE(v.publication_status, 'not_scheduled') = 'published'
		    AND v.publication_start_at IS NOT NULL
		    AND v.publication_end_at IS NOT NULL
		    AND v.publication_start_at <= now()
		    AND v.publication_end_at >= now()
		  )
		  OR (
		    $1 IN ('past', 'completed')
		    AND (
		      v.status IN ('stopped', 'completed', 'expired')
		      OR (v.status = 'published' AND v.publication_end_at IS NOT NULL AND v.publication_end_at < now())
		    )
		  )
		  OR v.status = $1
		)
		ORDER BY
		  CASE WHEN $1 IN ('past', 'completed') THEN COALESCE(v.completed_at, v.stopped_at, v.expired_at, v.publication_end_at, v.updated_at, v.created_at) END DESC,
		  CASE WHEN $1 IN ('published', 'active') THEN COALESCE(v.published_at, v.publication_start_at, v.updated_at, v.created_at) END DESC,
		  COALESCE(v.updated_at, v.created_at) DESC
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
		if err := r.hydrateVotingStats(ctx, &voting, userID); err != nil {
			return nil, err
		}
		votings = append(votings, voting)
	}

	return votings, rows.Err()
}

func (r *Repository) Get(ctx context.Context, id string) (model.Voting, error) {
	return r.GetForUser(ctx, id, "")
}

func (r *Repository) GetForUser(ctx context.Context, id, userID string) (model.Voting, error) {
	if err := r.syncReviewStatuses(ctx); err != nil {
		return model.Voting{}, err
	}

	row := r.db.QueryRow(ctx, `
		SELECT v.id, v.title, v.description, v.status, v.created_by,
		       v.meeting_id::text, COALESCE(v.version, 1), v.review_deadline,
		       v.publication_start_at, v.publication_end_at,
		       COALESCE(v.publication_send_notifications, false),
		       v.publication_scheduled_at,
		       COALESCE(v.publication_status, 'not_scheduled'),
		       v.published_at, v.min_stop_at, v.stopped_at, v.completed_at, v.expired_at,
		       v.created_at, v.updated_at,
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
	if err := r.hydrateVotingStats(ctx, &voting, userID); err != nil {
		return model.Voting{}, err
	}

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
	_, err := r.db.Exec(ctx, `DELETE FROM votings WHERE id = $1 AND status IN ('draft', 'revision_required', 'pending_publish')`, id)
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

func (r *Repository) SchedulePublication(ctx context.Context, id string, startAt, endAt, minStopAt time.Time, sendNotifications bool) error {
	tag, err := r.db.Exec(ctx, `
		UPDATE votings
		SET publication_start_at = $2,
		    publication_end_at = $3,
		    publication_send_notifications = $4,
		    publication_scheduled_at = now(),
		    publication_status = $5,
		    min_stop_at = $7,
		    published_at = NULL,
		    stopped_at = NULL,
		    completed_at = NULL,
		    expired_at = NULL,
		    updated_at = now()
		WHERE id = $1 AND status = $6
	`, id, startAt, endAt, sendNotifications, model.PublicationScheduled, model.StatusPendingPublish, minStopAt)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return errors.New("voting is not pending publication")
	}
	return nil
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
	if err := r.MarkExpiredReviews(ctx); err != nil {
		return err
	}
	if err := r.PublishDueScheduledVotings(ctx); err != nil {
		return err
	}
	return r.ExpirePublishedVotings(ctx)
}

func (r *Repository) PublishDueScheduledVotings(ctx context.Context) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	rows, err := tx.Query(ctx, `
		UPDATE votings
		SET status = $1,
		    publication_status = $2,
		    published_at = COALESCE(published_at, publication_start_at),
		    min_stop_at = COALESCE(min_stop_at, publication_start_at + interval '7 days'),
		    updated_at = now()
		WHERE status = $3
		  AND publication_status = $4
		  AND publication_start_at IS NOT NULL
		  AND publication_start_at <= now()
		RETURNING id, title, publication_end_at, meeting_id::text
	`, model.StatusPublished, model.PublicationPublished, model.StatusPendingPublish, model.PublicationScheduled)
	if err != nil {
		return err
	}

	due := []duePublication{}
	for rows.Next() {
		var item duePublication
		if err := rows.Scan(&item.ID, &item.Title, &item.EndAt, &item.MeetingID); err != nil {
			rows.Close()
			return err
		}
		due = append(due, item)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return err
	}
	rows.Close()

	for _, item := range due {
		meetingTitle, err := r.publicationMeetingLabel(ctx, item.MeetingID)
		if err != nil {
			return err
		}
		message := fmt.Sprintf(
			"Вам доступно голосование по собранию: %s.",
			meetingTitle,
		)
		_, err = tx.Exec(ctx, `
			INSERT INTO notifications (id, user_id, type, title, message, voting_id, action_label, action_component)
			SELECT $1 || '-' || owner.user_id,
			       owner.user_id,
			       $2,
			       $3,
			       $4,
			       $5,
			       $6,
			       $7
			FROM (
				SELECT DISTINCT user_id
				FROM property_owners
				WHERE status = 'active'
			) owner
			WHERE NOT EXISTS (
				SELECT 1
				FROM voting_answers va
				WHERE va.voting_id = $5
				  AND va.voted_by_user_id = owner.user_id
			)
			ON CONFLICT DO NOTHING
		`, "voting-published-"+item.ID, "voting_published", "Открыто голосование", message, item.ID, "Перейти к голосованию", "votings_active")
		if err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}

func (r *Repository) ExpirePublishedVotings(ctx context.Context) error {
	_, err := r.db.Exec(ctx, `
		UPDATE votings
		SET status = $1,
		    expired_at = COALESCE(expired_at, now()),
		    completed_at = COALESCE(completed_at, now()),
		    updated_at = now()
		WHERE status = $2
		  AND publication_end_at IS NOT NULL
		  AND publication_end_at < now()
	`, model.StatusExpired, model.StatusPublished)
	return err
}

func (r *Repository) StopVoting(ctx context.Context, id string) error {
	tag, err := r.db.Exec(ctx, `
		UPDATE votings
		SET status = $2,
		    stopped_at = COALESCE(stopped_at, now()),
		    completed_at = COALESCE(completed_at, now()),
		    updated_at = now()
		WHERE id = $1
		  AND status = $3
	`, id, model.StatusStopped, model.StatusPublished)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return errors.New("voting is not active")
	}
	return nil
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

func (r *Repository) VotingParticipationStats(ctx context.Context, votingID, userID string) (int, int, bool, error) {
	var total int
	if err := r.db.QueryRow(ctx, `
		SELECT COUNT(DISTINCT user_id)
		FROM property_owners
		WHERE status = 'active'
	`).Scan(&total); err != nil {
		return 0, 0, false, err
	}

	var voted int
	if err := r.db.QueryRow(ctx, `
		SELECT COUNT(DISTINCT voted_by_user_id)
		FROM voting_answers
		WHERE voting_id = $1
	`, votingID).Scan(&voted); err != nil {
		return 0, 0, false, err
	}

	userHasVoted := false
	if userID != "" {
		err := r.db.QueryRow(ctx, `
			SELECT EXISTS (
				SELECT 1
				FROM voting_answers
				WHERE voting_id = $1
				  AND voted_by_user_id = $2
			)
		`, votingID, userID).Scan(&userHasVoted)
		if err != nil {
			return 0, 0, false, err
		}
	}

	return total, voted, userHasVoted, nil
}

func (r *Repository) hydrateVotingStats(ctx context.Context, voting *model.Voting, userID string) error {
	total, voted, userHasVoted, err := r.VotingParticipationStats(ctx, voting.ID, userID)
	if err != nil {
		return err
	}
	voting.TotalOwnersCount = total
	voting.VotedOwnersCount = voted
	voting.UserHasVoted = userHasVoted
	return nil
}

func (r *Repository) ownerVotingSubject(ctx context.Context, tx pgx.Tx, userID string) (string, string, error) {
	var propertyID string
	var votingGroupID string
	err := tx.QueryRow(ctx, `
		SELECT
			po.property_id,
			COALESCE(NULLIF(po.voting_group_id, ''), po.property_id) AS voting_group_id
		FROM property_owners po
		WHERE po.user_id = $1
		  AND po.status = 'active'
		ORDER BY po.is_primary DESC, po.created_at ASC, po.property_id ASC
		LIMIT 1
	`, userID).Scan(&propertyID, &votingGroupID)
	if err == pgx.ErrNoRows {
		return "", "", errors.New("У пользователя нет активного объекта имущества.")
	}
	return propertyID, votingGroupID, err
}

func (r *Repository) OwnerAlreadyVoted(ctx context.Context, votingID, userID string) (bool, error) {
	var exists bool
	err := r.db.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM voting_submissions vs
			WHERE vs.voting_id = $1
			  AND vs.user_id = $2
			UNION
			SELECT 1
			FROM voting_answers va
			WHERE va.voting_id = $1
			  AND va.voted_by_user_id = $2
		)
	`, votingID, userID).Scan(&exists)
	return exists, err
}

func (r *Repository) SubmitOwnerVote(ctx context.Context, votingID, userID, signatureMethod string, signedAt time.Time, answers []model.OwnerVotingAnswer) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var hasAnswers bool
	if err := tx.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM voting_answers
			WHERE voting_id = $1
			  AND voted_by_user_id = $2
		)
	`, votingID, userID).Scan(&hasAnswers); err != nil {
		return err
	}
	if hasAnswers {
		return ErrOwnerAlreadyVoted
	}

	propertyID, votingGroupID, err := r.ownerVotingSubject(ctx, tx, userID)
	if err != nil {
		return err
	}

	submissionID := fmt.Sprintf("%s-submission-%s-%d", votingID, userID, time.Now().UnixNano())
	_, err = tx.Exec(ctx, `
		INSERT INTO voting_submissions (
			id,
			voting_id,
			user_id,
			signature_method,
			signature_status,
			signed_at
		)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, submissionID, votingID, userID, signatureMethod, model.SignatureSigned, signedAt)
	if err != nil {
		if isUniqueViolation(err) {
			return ErrOwnerAlreadyVoted
		}
		return err
	}

	payload := ownerAnswerPayload{Answers: make([]ownerAnswerPayloadItem, 0, len(answers))}
	for _, answer := range answers {
		payload.Answers = append(payload.Answers, ownerAnswerPayloadItem{
			QuestionID: answer.QuestionID,
			Answer:     answer.Answer,
		})
	}
	payloadJSON, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	answerID := fmt.Sprintf("%s-answer-%s-%d", votingID, userID, time.Now().UnixNano())
	_, err = tx.Exec(ctx, `
		INSERT INTO voting_answers (
			id,
			voting_id,
			property_id,
			voting_group_id,
			voted_by_user_id,
			answer,
			signed_at
		)
		VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
	`, answerID, votingID, propertyID, votingGroupID, userID, string(payloadJSON), signedAt)
	if err != nil {
		if isUniqueViolation(err) {
			return ErrOwnerAlreadyVoted
		}
		return err
	}

	return tx.Commit(ctx)
}

func (r *Repository) OwnerAnswers(ctx context.Context, votingID, userID string) ([]model.OwnerVotingAnswer, error) {
	rows, err := r.db.Query(ctx, `
		SELECT
			va.id,
			q.id,
			q.text,
			COALESCE(answer_item.answer, '') AS answer,
			COALESCE(vs.signature_method, '') AS signature_method,
			COALESCE(vs.signature_status, '') AS signature_status,
			COALESCE(vs.signed_at, va.signed_at) AS signed_at,
			COALESCE(va.signed_at, vs.created_at) AS created_at
		FROM voting_answers va
		CROSS JOIN LATERAL jsonb_to_recordset(
			CASE
				WHEN jsonb_typeof(va.answer->'answers') = 'array' THEN va.answer->'answers'
				ELSE '[]'::jsonb
			END
		) AS answer_item(question_id text, answer text)
		JOIN voting_questions q ON q.voting_id = va.voting_id AND q.id = answer_item.question_id
		LEFT JOIN voting_submissions vs ON vs.voting_id = va.voting_id
			AND vs.user_id = va.voted_by_user_id
		WHERE va.voting_id = $1
		  AND va.voted_by_user_id = $2
		ORDER BY q.created_at ASC, q.id ASC
	`, votingID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	answers := []model.OwnerVotingAnswer{}
	for rows.Next() {
		var answer model.OwnerVotingAnswer
		var signedAt *time.Time
		var createdAt *time.Time
		if err := rows.Scan(
			&answer.ID,
			&answer.QuestionID,
			&answer.QuestionText,
			&answer.Answer,
			&answer.SignatureMethod,
			&answer.SignatureStatus,
			&signedAt,
			&createdAt,
		); err != nil {
			return nil, err
		}
		answer.VotingID = votingID
		answer.SignedAt = datetime.PtrAsAstanaWallTime(signedAt)
		answer.CreatedAt = datetime.PtrAsAstanaWallTime(createdAt)
		answers = append(answers, answer)
	}

	return answers, rows.Err()
}

func (r *Repository) VotingResults(ctx context.Context, votingID string) ([]model.VotingResult, error) {
	rows, err := r.db.Query(ctx, `
		SELECT
			q.id,
			q.text,
			COUNT(answer_value.answer) FILTER (WHERE answer_value.answer = 'for') AS for_count,
			COUNT(answer_value.answer) FILTER (WHERE answer_value.answer = 'against') AS against_count,
			COUNT(answer_value.answer) FILTER (WHERE answer_value.answer = 'abstain') AS abstain_count
		FROM voting_questions q
		LEFT JOIN LATERAL (
			SELECT answer_item.answer
			FROM voting_answers va
			CROSS JOIN LATERAL jsonb_to_recordset(
				CASE
					WHEN jsonb_typeof(va.answer->'answers') = 'array' THEN va.answer->'answers'
					ELSE '[]'::jsonb
				END
			) AS answer_item(question_id text, answer text)
			WHERE va.voting_id = q.voting_id
			  AND answer_item.question_id = q.id
		) answer_value ON true
		WHERE q.voting_id = $1
		GROUP BY q.id, q.text, q.created_at
		ORDER BY q.created_at ASC, q.id ASC
	`, votingID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	results := []model.VotingResult{}
	for rows.Next() {
		var result model.VotingResult
		if err := rows.Scan(
			&result.QuestionID,
			&result.QuestionText,
			&result.ForCount,
			&result.AgainstCount,
			&result.AbstainCount,
		); err != nil {
			return nil, err
		}
		result.TotalCount = result.ForCount + result.AgainstCount + result.AbstainCount
		results = append(results, result)
	}

	return results, rows.Err()
}

func (r *Repository) VotingBlank(ctx context.Context, votingID, userID string) (model.VotingBlank, error) {
	voting, err := r.GetForUser(ctx, votingID, userID)
	if err != nil {
		return model.VotingBlank{}, err
	}

	blank := model.VotingBlank{
		Voting:      voting,
		OwnerName:   "Собственник",
		GeneratedAt: datetime.Now(),
	}

	err = r.db.QueryRow(ctx, `
		SELECT
			COALESCE(u.full_name, u.email, 'Собственник') AS owner_name,
			COALESCE(string_agg(DISTINCT b.building_name, ', '), '') AS building_name,
			COALESCE(string_agg(DISTINCT p.number, ', '), '') AS property_label
		FROM users u
		LEFT JOIN property_owners po ON po.user_id = u.id AND po.status = 'active'
		LEFT JOIN property p ON p.id = po.property_id
		LEFT JOIN building b ON b.id = p.building_id
		WHERE u.id = $1
		GROUP BY u.id, u.full_name, u.email
	`, userID).Scan(&blank.OwnerName, &blank.BuildingName, &blank.PropertyLabel)
	if err != nil && err != pgx.ErrNoRows {
		return model.VotingBlank{}, err
	}

	return blank, nil
}

func (r *Repository) publicationMeetingLabel(ctx context.Context, meetingID *string) (string, error) {
	if meetingID == nil || *meetingID == "" {
		return "опросному листу", nil
	}

	var location string
	var scheduledAt time.Time
	err := r.db.QueryRow(ctx, `
		SELECT location, scheduled_at
		FROM meetings
		WHERE id = $1
	`, *meetingID).Scan(&location, &scheduledAt)
	if err == pgx.ErrNoRows {
		return "опросному листу", nil
	}
	if err != nil {
		return "", err
	}

	return fmt.Sprintf("%s, %s", location, datetime.AsAstanaWallTime(scheduledAt).Format("02.01.2006, 15:04")), nil
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
		vote.CreatedAt = datetime.AsAstanaWallTime(vote.CreatedAt)
		vote.UpdatedAt = datetime.AsAstanaWallTime(vote.UpdatedAt)
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

type duePublication struct {
	ID        string
	Title     string
	EndAt     *time.Time
	MeetingID *string
}

type ownerAnswerPayload struct {
	Answers []ownerAnswerPayloadItem `json:"answers"`
}

type ownerAnswerPayloadItem struct {
	QuestionID string `json:"question_id"`
	Answer     string `json:"answer"`
}

func formatNotificationDate(value *time.Time) string {
	if value == nil {
		return "указанного срока"
	}
	return datetime.AsAstanaWallTime(*value).Format("02.01.2006, 15:04")
}

func scanVoting(row rowScanner) (model.Voting, error) {
	var voting model.Voting
	var meetingID *string
	var reviewDeadline *time.Time
	var publicationStartAt *time.Time
	var publicationEndAt *time.Time
	var publicationScheduledAt *time.Time
	var publicationStatus string
	var publishedAt *time.Time
	var minStopAt *time.Time
	var stoppedAt *time.Time
	var completedAt *time.Time
	var expiredAt *time.Time
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
		&publicationStartAt,
		&publicationEndAt,
		&voting.PublicationSendNotifications,
		&publicationScheduledAt,
		&publicationStatus,
		&publishedAt,
		&minStopAt,
		&stoppedAt,
		&completedAt,
		&expiredAt,
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
	voting.ReviewDeadline = datetime.PtrAsAstanaWallTime(reviewDeadline)
	voting.PublicationStartAt = datetime.PtrAsAstanaWallTime(publicationStartAt)
	voting.PublicationEndAt = datetime.PtrAsAstanaWallTime(publicationEndAt)
	voting.PublicationScheduledAt = datetime.PtrAsAstanaWallTime(publicationScheduledAt)
	voting.PublicationStatus = publicationStatus
	voting.PublishedAt = datetime.PtrAsAstanaWallTime(publishedAt)
	voting.MinStopAt = datetime.PtrAsAstanaWallTime(minStopAt)
	voting.StoppedAt = datetime.PtrAsAstanaWallTime(stoppedAt)
	voting.CompletedAt = datetime.PtrAsAstanaWallTime(completedAt)
	voting.ExpiredAt = datetime.PtrAsAstanaWallTime(expiredAt)
	voting.CreatedAt = datetime.PtrAsAstanaWallTime(createdAt)
	voting.UpdatedAt = datetime.PtrAsAstanaWallTime(updatedAt)

	if joinedMeetingID != nil && scheduledAt != nil {
		meeting := &model.Meeting{
			ID:          *joinedMeetingID,
			ScheduledAt: datetime.AsAstanaWallTime(*scheduledAt),
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
	review.Deadline = datetime.AsAstanaWallTime(review.Deadline)
	review.CreatedAt = datetime.AsAstanaWallTime(review.CreatedAt)
	review.UpdatedAt = datetime.AsAstanaWallTime(review.UpdatedAt)
	return review, err
}
