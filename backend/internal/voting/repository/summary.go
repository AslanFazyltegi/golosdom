package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"math"
	"sort"
	"strings"
	"time"

	"golosdom-backend/internal/common/datetime"
	"golosdom-backend/internal/voting/model"

	"github.com/jackc/pgx/v5"
)

type summaryCore struct {
	Voting        model.Voting
	Item          model.VotingSummaryListItem
	Owners        []model.VotingOwnerSummary
	NotVoted      []model.VotingNotVotedOwner
	Properties    []model.VotingPropertyBreakdown
	Questions     []model.VotingQuestionSummary
	Notifications model.VotingNotificationSummary
	ActionLog     []model.VotingActionLogItem
	SearchText    string
}

type notificationState struct {
	Status         string
	LastReminderAt *time.Time
}

type answerPayloadItem struct {
	QuestionID string `json:"question_id"`
	Answer     string `json:"answer"`
}

type answerPayload struct {
	Answers []answerPayloadItem `json:"answers"`
}

func (r *Repository) ListVotingSummary(ctx context.Context, filter model.VotingSummaryFilter) (model.VotingSummaryResponse, error) {
	if err := r.syncReviewStatuses(ctx); err != nil {
		return model.VotingSummaryResponse{}, err
	}

	votings, err := r.listSummaryVotings(ctx)
	if err != nil {
		return model.VotingSummaryResponse{}, err
	}

	cores := make([]summaryCore, 0, len(votings))
	for _, voting := range votings {
		core, err := r.buildSummaryCore(ctx, voting)
		if err != nil {
			return model.VotingSummaryResponse{}, err
		}
		if !summaryMatchesFilter(core, filter) {
			continue
		}
		cores = append(cores, core)
	}

	return buildSummaryResponse(cores), nil
}

func (r *Repository) VotingSummaryDetail(ctx context.Context, votingID string) (model.VotingSummaryDetail, error) {
	if err := r.syncReviewStatuses(ctx); err != nil {
		return model.VotingSummaryDetail{}, err
	}

	voting, err := r.Get(ctx, votingID)
	if err != nil {
		return model.VotingSummaryDetail{}, err
	}
	if !isSummaryVoting(voting) {
		return model.VotingSummaryDetail{}, pgx.ErrNoRows
	}

	core, err := r.buildSummaryCore(ctx, voting)
	if err != nil {
		return model.VotingSummaryDetail{}, err
	}

	header := buildDetailHeader(core)
	return model.VotingSummaryDetail{
		Voting:        header,
		Overview:      buildOverview(header, core.Notifications, len(core.ActionLog)),
		Questions:     core.Questions,
		Owners:        core.Owners,
		NotVoted:      core.NotVoted,
		Properties:    core.Properties,
		Notifications: core.Notifications,
		Documents:     buildDocuments(core),
		Procedure:     buildProcedure(core),
		ActionLog:     core.ActionLog,
	}, nil
}

func (r *Repository) SendVotingReminders(ctx context.Context, votingID, actorUserID string, userIDs []string) (int, error) {
	voting, err := r.Get(ctx, votingID)
	if err != nil {
		return 0, err
	}
	if voting.Status != model.StatusPublished {
		return 0, errors.New("Напоминания доступны только для идущего голосования.")
	}
	now := datetime.Now()
	if voting.PublicationStartAt == nil || voting.PublicationEndAt == nil || now.Before(*voting.PublicationStartAt) || now.After(*voting.PublicationEndAt) {
		return 0, errors.New("Напоминания доступны только в период сбора голосов.")
	}

	core, err := r.buildSummaryCore(ctx, voting)
	if err != nil {
		return 0, err
	}

	requested := map[string]bool{}
	for _, userID := range userIDs {
		userID = strings.TrimSpace(userID)
		if userID != "" {
			requested[userID] = true
		}
	}

	targets := []model.VotingNotVotedOwner{}
	for _, owner := range core.NotVoted {
		if len(requested) == 0 || requested[owner.OwnerID] {
			targets = append(targets, owner)
		}
	}
	if len(targets) == 0 {
		return 0, errors.New("Нет получателей для напоминания.")
	}

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)

	for _, owner := range targets {
		_, err = tx.Exec(ctx, `
			INSERT INTO notifications (id, user_id, type, title, message, voting_id, action_label, action_component, created_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		`,
			fmt.Sprintf("voting-reminder-%s-%s-%d", votingID, owner.OwnerID, time.Now().UnixNano()),
			owner.OwnerID,
			"voting_reminder",
			"Напоминание о голосовании",
			fmt.Sprintf("Вы ещё не проголосовали по опросному листу: %s.", voting.Title),
			votingID,
			"Перейти к голосованию",
			"votings_active",
			now,
		)
		if err != nil {
			return 0, err
		}
	}

	if err := r.insertVotingReminderCommunicationNotification(ctx, tx, voting, actorUserID, targets, now); err != nil {
		return 0, err
	}

	if err := insertVotingActionLog(ctx, tx, votingID, actorUserID, "CHAIRMAN", "reminder_sent", fmt.Sprintf("Отправлено напоминаний: %d", len(targets)), now); err != nil {
		return 0, err
	}

	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}

	return len(targets), nil
}

func (r *Repository) insertVotingReminderCommunicationNotification(
	ctx context.Context,
	tx pgx.Tx,
	voting model.Voting,
	actorUserID string,
	targets []model.VotingNotVotedOwner,
	now time.Time,
) error {
	authorUserID := strings.TrimSpace(actorUserID)
	if authorUserID == "" {
		authorUserID = strings.TrimSpace(voting.CreatedBy)
	}
	if authorUserID == "" {
		return errors.New("Не удалось определить автора напоминания.")
	}

	buildingID, err := reminderBuildingID(ctx, tx, targets)
	if err != nil {
		return err
	}

	notificationID := fmt.Sprintf("voting-reminder-%s-%d", voting.ID, now.UnixNano())
	title := "Напоминание о голосовании"
	body := fmt.Sprintf("Вы ещё не проголосовали по опросному листу: %s.", voting.Title)
	bodyHTML := "<p>" + html.EscapeString(body) + "</p>"
	audienceSummary := fmt.Sprintf("Не проголосовавшие собственники: %d", len(targets))

	if _, err := tx.Exec(ctx, `
		INSERT INTO communication_notifications (
			id,
			building_id,
			author_user_id,
			title,
			body,
			body_html,
			status,
			category,
			audience_summary,
			sent_at
		) VALUES (
			$1::text,
			$2::text,
			$3::text,
			$4::text,
			$5::text,
			$6::text,
			'sent',
			'Голосование',
			$7::text,
			$8::timestamp
		)
	`, notificationID, buildingID, authorUserID, title, body, bodyHTML, audienceSummary, now); err != nil {
		return fmt.Errorf("create voting reminder notification: %w", err)
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO communication_channels (id, notification_id, channel, enabled)
		VALUES ($1::text, $2::text, 'portal', true)
	`, notificationID+"-channel-portal", notificationID); err != nil {
		return fmt.Errorf("create voting reminder notification channel: %w", err)
	}

	for index, owner := range targets {
		if _, err := tx.Exec(ctx, `
			INSERT INTO communication_notification_targets (id, notification_id, target_type, target_value)
			VALUES ($1::text, $2::text, 'user', $3::text)
		`, fmt.Sprintf("%s-target-%d", notificationID, index), notificationID, owner.OwnerID); err != nil {
			return fmt.Errorf("create voting reminder notification target: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO communication_deliveries (
				id,
				entity_type,
				entity_id,
				user_id,
				channel,
				status,
				sent_at,
				delivered_at
			) VALUES (
				$1::text,
				'notification',
				$2::text,
				$3::text,
				'portal',
				'delivered',
				$4::timestamp,
				$4::timestamp
			)
		`, fmt.Sprintf("delivery-notification-%s-%s-portal", notificationID, owner.OwnerID), notificationID, owner.OwnerID, now); err != nil {
			return fmt.Errorf("create voting reminder notification delivery: %w", err)
		}
	}

	return nil
}

func reminderBuildingID(ctx context.Context, tx pgx.Tx, targets []model.VotingNotVotedOwner) (string, error) {
	for _, owner := range targets {
		var buildingID string
		err := tx.QueryRow(ctx, `
			SELECT p.building_id
			FROM property_owners po
			JOIN property p ON p.id = po.property_id
			WHERE po.user_id = $1
				AND po.status = 'active'
			ORDER BY p.id
			LIMIT 1
		`, owner.OwnerID).Scan(&buildingID)
		if err == nil {
			return buildingID, nil
		}
		if err != pgx.ErrNoRows {
			return "", fmt.Errorf("find voting reminder building: %w", err)
		}
	}

	var buildingID string
	if err := tx.QueryRow(ctx, `SELECT id FROM building ORDER BY created_at ASC LIMIT 1`).Scan(&buildingID); err != nil {
		return "", fmt.Errorf("find primary building for voting reminder: %w", err)
	}
	return buildingID, nil
}

func (r *Repository) listSummaryVotings(ctx context.Context) ([]model.Voting, error) {
	rows, err := r.db.Query(ctx, `
		SELECT v.id, v.title, v.description, v.status, v.created_by,
		       COALESCE(NULLIF(v.category, ''), 'general'),
		       v.meeting_id::text, COALESCE(v.version, 1), v.review_deadline,
		       v.publication_start_at, v.publication_end_at,
		       COALESCE(v.publication_send_notifications, false),
		       v.publication_scheduled_at,
		       COALESCE(v.publication_status, 'not_scheduled'),
		       v.published_at, v.min_stop_at, v.stopped_at, v.completed_at, v.expired_at,
		       COALESCE(v.completion_reason, ''), COALESCE(v.completion_type, ''),
		       v.created_at, v.updated_at,
		       m.id::text, m.initiator_name, m.scheduled_at, m.location, m.agenda, m.meeting_form
		FROM votings v
		LEFT JOIN meetings m ON m.id = v.meeting_id
		WHERE v.status IN ('published', 'stopped', 'completed', 'expired')
		  AND COALESCE(v.publication_status, 'not_scheduled') = 'published'
		  AND v.published_at IS NOT NULL
		ORDER BY COALESCE(m.scheduled_at, v.published_at, v.created_at) DESC, COALESCE(v.published_at, v.created_at) DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := []model.Voting{}
	for rows.Next() {
		voting, err := scanVoting(rows)
		if err != nil {
			return nil, err
		}
		voting.Questions, err = r.getQuestions(ctx, voting.ID)
		if err != nil {
			return nil, err
		}
		result = append(result, voting)
	}
	return result, rows.Err()
}

func (r *Repository) buildSummaryCore(ctx context.Context, voting model.Voting) (summaryCore, error) {
	owners, _, err := r.eligibleVotingOwners(ctx, voting.Category)
	if err != nil {
		return summaryCore{}, err
	}
	eligiblePropertyIDs, err := r.eligibleVotingPropertyIDs(ctx, voting.Category)
	if err != nil {
		return summaryCore{}, err
	}

	notificationStates, notificationSummary, err := r.votingNotificationSummary(ctx, voting.ID, owners)
	if err != nil {
		return summaryCore{}, err
	}
	attachNotificationStates(owners, notificationStates)

	answersByOwner, signatureByOwner, invalidVoters, err := r.votingAnswerData(ctx, voting.ID)
	if err != nil {
		return summaryCore{}, err
	}

	ownerByID := map[string]*model.VotingOwnerSummary{}
	for i := range owners {
		owner := &owners[i]
		ownerByID[owner.OwnerID] = owner
		if answers, ok := answersByOwner[owner.OwnerID]; ok && len(answers) > 0 {
			owner.Status = "voted"
			owner.Answers = answers
			if signature, ok := signatureByOwner[owner.OwnerID]; ok {
				owner.Method = signature.Method
				owner.Signature = signature
				owner.VotedAt = signature.SignedAt
			}
			owner.PDFStatus = "not_formed"
		}
	}
	for userID := range answersByOwner {
		if _, ok := ownerByID[userID]; !ok {
			invalidVoters = append(invalidVoters, userID)
		}
	}

	notVoted := []model.VotingNotVotedOwner{}
	for _, owner := range owners {
		if owner.Status == "voted" {
			continue
		}
		notVoted = append(notVoted, model.VotingNotVotedOwner{
			OwnerID:            owner.OwnerID,
			OwnerName:          owner.OwnerName,
			Email:              owner.Email,
			Phone:              owner.Phone,
			Properties:         owner.Properties,
			PropertyLabel:      owner.PropertyLabel,
			PropertyTypes:      owner.PropertyTypes,
			PropertyVotes:      owner.PropertyVotes,
			NotificationStatus: notificationStates[owner.OwnerID].Status,
			LastReminderAt:     notificationStates[owner.OwnerID].LastReminderAt,
		})
	}

	votedPropertyIDs, duplicateVoteWarnings := votingParticipationByProperty(owners)
	totalPropertyVotes := len(eligiblePropertyIDs)
	questions, questionWarnings := buildQuestionSummaries(voting, owners, totalPropertyVotes)
	properties, err := r.propertyBreakdown(ctx, voting.Category, eligiblePropertyIDs, votedPropertyIDs)
	if err != nil {
		return summaryCore{}, err
	}

	warnings := []string{}
	warnings = append(warnings, duplicateVoteWarnings...)
	warnings = append(warnings, questionWarnings...)
	for _, userID := range invalidVoters {
		warnings = append(warnings, fmt.Sprintf("Голос есть, но собственник %s не имеет подходящего имущества для категории опросника.", userID))
	}
	if len(votedPropertyIDs) > totalPropertyVotes {
		warnings = append(warnings, "Голосов больше, чем подходящих объектов имущества.")
	}

	accepted := 0
	for _, question := range questions {
		if question.Result == "accepted" {
			accepted++
		}
	}

	item := buildSummaryListItem(voting, owners, totalPropertyVotes, len(votedPropertyIDs), accepted, len(questions), warnings)
	actionLog, err := r.votingActionLog(ctx, voting, owners)
	if err != nil {
		return summaryCore{}, err
	}

	return summaryCore{
		Voting:        voting,
		Item:          item,
		Owners:        owners,
		NotVoted:      notVoted,
		Properties:    properties,
		Questions:     questions,
		Notifications: notificationSummary,
		ActionLog:     actionLog,
		SearchText:    summarySearchText(voting, owners),
	}, nil
}

func (r *Repository) eligibleVotingOwners(ctx context.Context, category string) ([]model.VotingOwnerSummary, map[string]bool, error) {
	rows, err := r.db.Query(ctx, `
		SELECT
			u.id,
			COALESCE(NULLIF(u.full_name, ''), u.email) AS owner_name,
			u.email,
			u.phone,
			p.id,
			p.type,
			p.number,
			p.erc_account,
			po.ownership_share
		FROM property p
		JOIN property_owners po
			ON po.property_id = p.id
			AND po.status = 'active'
		JOIN users u
			ON u.id = po.user_id
		WHERE p.status = 'active'
		  AND (
		    $1 = 'general'
		    OR ($1 = 'apartments_and_commercial' AND p.type IN ('apartment', 'commercial_room'))
		    OR ($1 = 'parking_and_storerooms' AND p.type IN ('parking', 'storage'))
		  )
		ORDER BY owner_name, p.type, length(p.number), p.number
	`, normalizedCategory(category))
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()

	owners := []model.VotingOwnerSummary{}
	ownerIndex := map[string]int{}
	eligiblePropertyTypes := map[string]bool{}

	for rows.Next() {
		var ownerID, ownerName, email, propertyID, propertyType, number string
		var phone, ercAccount sql.NullString
		var share sql.NullFloat64
		if err := rows.Scan(&ownerID, &ownerName, &email, &phone, &propertyID, &propertyType, &number, &ercAccount, &share); err != nil {
			return nil, nil, err
		}

		index, exists := ownerIndex[ownerID]
		if !exists {
			owners = append(owners, model.VotingOwnerSummary{
				OwnerID:   ownerID,
				OwnerName: ownerName,
				Email:     email,
				Phone:     nullStringValue(phone),
				Status:    "not_voted",
				Method:    "",
				Signature: model.VotingSignatureInfo{
					Status: "none",
				},
				PDFStatus: "not_formed",
				Answers:   []model.VotingOwnerAnswer{},
			})
			index = len(owners) - 1
			ownerIndex[ownerID] = index
		}

		owners[index].Properties = append(owners[index].Properties, model.VotingOwnerProperty{
			ID:         propertyID,
			Type:       propertyType,
			TypeLabel:  propertyTypeLabel(propertyType),
			Number:     number,
			ErcAccount: nullStringValue(ercAccount),
			Share:      nullFloatPtr(share),
		})
		eligiblePropertyTypes[propertyID] = true
	}
	if err := rows.Err(); err != nil {
		return nil, nil, err
	}

	for i := range owners {
		owners[i].PropertyVotes = len(uniqueOwnerPropertyIDs(owners[i].Properties))
		owners[i].PropertyLabel = ownerPropertyLabel(owners[i].Properties)
		owners[i].PropertyTypes = ownerPropertyTypes(owners[i].Properties)
		owners[i].ErcAccounts = ownerPropertyErcAccounts(owners[i].Properties)
	}

	return owners, eligiblePropertyTypes, nil
}

func (r *Repository) eligibleVotingPropertyIDs(ctx context.Context, category string) (map[string]bool, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id
		FROM property
		WHERE status = 'active'
		  AND (
		    $1 = 'general'
		    OR ($1 = 'apartments_and_commercial' AND type IN ('apartment', 'commercial_room'))
		    OR ($1 = 'parking_and_storerooms' AND type IN ('parking', 'storage'))
		  )
	`, normalizedCategory(category))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := map[string]bool{}
	for rows.Next() {
		var propertyID string
		if err := rows.Scan(&propertyID); err != nil {
			return nil, err
		}
		result[propertyID] = true
	}
	return result, rows.Err()
}

func (r *Repository) votingAnswerData(ctx context.Context, votingID string) (map[string][]model.VotingOwnerAnswer, map[string]model.VotingSignatureInfo, []string, error) {
	rows, err := r.db.Query(ctx, `
		SELECT
			va.voted_by_user_id,
			va.answer,
			COALESCE(vs.signature_method, '') AS signature_method,
			COALESCE(vs.signature_status, '') AS signature_status,
			COALESCE(vs.signed_at, va.signed_at) AS signed_at
		FROM voting_answers va
		LEFT JOIN voting_submissions vs
			ON vs.voting_id = va.voting_id
			AND vs.user_id = va.voted_by_user_id
		WHERE va.voting_id = $1
		ORDER BY COALESCE(vs.signed_at, va.signed_at), va.id
	`, votingID)
	if err != nil {
		return nil, nil, nil, err
	}
	defer rows.Close()

	questionText := map[string]string{}
	qRows, err := r.db.Query(ctx, `
		SELECT id, text
		FROM voting_questions
		WHERE voting_id = $1
		ORDER BY created_at ASC, id ASC
	`, votingID)
	if err != nil {
		return nil, nil, nil, err
	}
	for qRows.Next() {
		var id, text string
		if err := qRows.Scan(&id, &text); err != nil {
			qRows.Close()
			return nil, nil, nil, err
		}
		questionText[id] = text
	}
	if err := qRows.Err(); err != nil {
		qRows.Close()
		return nil, nil, nil, err
	}
	qRows.Close()

	answersByOwner := map[string][]model.VotingOwnerAnswer{}
	signatureByOwner := map[string]model.VotingSignatureInfo{}
	seenOwners := map[string]bool{}
	for rows.Next() {
		var ownerID string
		var payloadBytes []byte
		var method, signatureStatus string
		var signedAt *time.Time
		if err := rows.Scan(&ownerID, &payloadBytes, &method, &signatureStatus, &signedAt); err != nil {
			return nil, nil, nil, err
		}

		var payload answerPayload
		if err := json.Unmarshal(payloadBytes, &payload); err != nil {
			return nil, nil, nil, err
		}
		for _, item := range payload.Answers {
			answersByOwner[ownerID] = append(answersByOwner[ownerID], model.VotingOwnerAnswer{
				QuestionID:   item.QuestionID,
				QuestionText: questionText[item.QuestionID],
				Answer:       item.Answer,
			})
		}
		convertedSignedAt := datetime.PtrAsAstanaWallTime(signedAt)
		status := signatureStatus
		if status == "" && convertedSignedAt != nil {
			status = "signed"
		}
		if status == "" {
			status = "none"
		}
		signatureByOwner[ownerID] = model.VotingSignatureInfo{
			Status:   status,
			Method:   method,
			SignedAt: convertedSignedAt,
		}
		seenOwners[ownerID] = true
	}
	if err := rows.Err(); err != nil {
		return nil, nil, nil, err
	}

	invalid := []string{}
	for ownerID := range seenOwners {
		if len(answersByOwner[ownerID]) == 0 {
			invalid = append(invalid, ownerID)
		}
	}
	sort.Strings(invalid)

	return answersByOwner, signatureByOwner, invalid, nil
}

func (r *Repository) votingNotificationSummary(ctx context.Context, votingID string, owners []model.VotingOwnerSummary) (map[string]notificationState, model.VotingNotificationSummary, error) {
	stateByOwner := map[string]notificationState{}
	for _, owner := range owners {
		status := "not_sent"
		if strings.TrimSpace(owner.Email) == "" && strings.TrimSpace(owner.Phone) == "" {
			status = "no_contacts"
		}
		stateByOwner[owner.OwnerID] = notificationState{Status: status}
	}

	rows, err := r.db.Query(ctx, `
		SELECT user_id,
		       COUNT(*) AS total,
		       COUNT(*) FILTER (WHERE read_at IS NOT NULL) AS read_count,
		       MAX(created_at) FILTER (WHERE type = 'voting_reminder') AS last_reminder_at
		FROM notifications
		WHERE voting_id = $1
		GROUP BY user_id
	`, votingID)
	if err != nil {
		return nil, model.VotingNotificationSummary{}, err
	}
	defer rows.Close()

	for rows.Next() {
		var userID string
		var total, readCount int
		var lastReminderAt *time.Time
		if err := rows.Scan(&userID, &total, &readCount, &lastReminderAt); err != nil {
			return nil, model.VotingNotificationSummary{}, err
		}
		state := stateByOwner[userID]
		if total > 0 {
			state.Status = "sent"
		}
		if readCount > 0 {
			state.Status = "read"
		}
		state.LastReminderAt = datetime.PtrAsAstanaWallTime(lastReminderAt)
		stateByOwner[userID] = state
	}
	if err := rows.Err(); err != nil {
		return nil, model.VotingNotificationSummary{}, err
	}

	summary := model.VotingNotificationSummary{}
	for _, owner := range owners {
		if strings.TrimSpace(owner.Email) == "" && strings.TrimSpace(owner.Phone) == "" {
			summary.NoContacts++
		}
	}

	events, err := r.votingNotificationEvents(ctx, votingID)
	if err != nil {
		return nil, model.VotingNotificationSummary{}, err
	}
	summary.Events = events
	for _, event := range events {
		summary.Sent += event.Recipients
		summary.Delivered += event.Delivered
		summary.Read += event.Read
		summary.Failed += event.Failed
		if event.Type == "reminder" || event.Type == "repeat_reminder" {
			if summary.LastReminderAt == nil || (event.Date != nil && event.Date.After(*summary.LastReminderAt)) {
				summary.LastReminderAt = event.Date
			}
		}
	}

	return stateByOwner, summary, nil
}

func (r *Repository) votingNotificationEvents(ctx context.Context, votingID string) ([]model.VotingNotificationEvent, error) {
	rows, err := r.db.Query(ctx, `
		SELECT date_trunc('minute', created_at) AS event_at,
		       type,
		       COUNT(*) AS recipients,
		       COUNT(*) AS delivered,
		       COUNT(*) FILTER (WHERE read_at IS NOT NULL) AS read_count
		FROM notifications
		WHERE voting_id = $1
		GROUP BY date_trunc('minute', created_at), type
		ORDER BY event_at DESC
	`, votingID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	events := []model.VotingNotificationEvent{}
	for rows.Next() {
		var date *time.Time
		var eventType string
		var recipients, delivered, read int
		if err := rows.Scan(&date, &eventType, &recipients, &delivered, &read); err != nil {
			return nil, err
		}
		events = append(events, model.VotingNotificationEvent{
			Date:       datetime.PtrAsAstanaWallTime(date),
			Type:       notificationEventType(eventType),
			Recipients: recipients,
			Delivered:  delivered,
			Read:       read,
			Failed:     0,
		})
	}
	return events, rows.Err()
}

func (r *Repository) propertyBreakdown(ctx context.Context, category string, eligiblePropertyIDs map[string]bool, votedPropertyIDs map[string]bool) ([]model.VotingPropertyBreakdown, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, type
		FROM property
		WHERE status = 'active'
		ORDER BY type, id
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	byType := map[string]*model.VotingPropertyBreakdown{}
	for _, propertyType := range []string{"apartment", "commercial_room", "storage", "parking"} {
		byType[propertyType] = &model.VotingPropertyBreakdown{
			Type:      propertyType,
			TypeLabel: propertyTypeLabel(propertyType),
		}
	}

	for rows.Next() {
		var propertyID, propertyType string
		if err := rows.Scan(&propertyID, &propertyType); err != nil {
			return nil, err
		}
		item, exists := byType[propertyType]
		if !exists {
			item = &model.VotingPropertyBreakdown{Type: propertyType, TypeLabel: propertyTypeLabel(propertyType)}
			byType[propertyType] = item
		}
		item.TotalObjects++
		if eligiblePropertyIDs[propertyID] && propertyMatchesCategory(propertyType, category) {
			item.EligibleObjects++
		}
		if votedPropertyIDs[propertyID] {
			item.VotedObjects++
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	result := []model.VotingPropertyBreakdown{}
	for _, propertyType := range []string{"apartment", "commercial_room", "storage", "parking"} {
		item := byType[propertyType]
		item.NotVotedObjects = item.EligibleObjects - item.VotedObjects
		if item.NotVotedObjects < 0 {
			item.NotVotedObjects = 0
		}
		item.ParticipationPercent = percent(item.VotedObjects, item.EligibleObjects)
		result = append(result, *item)
	}

	return result, nil
}

func (r *Repository) votingActionLog(ctx context.Context, voting model.Voting, owners []model.VotingOwnerSummary) ([]model.VotingActionLogItem, error) {
	logs := []model.VotingActionLogItem{}

	if voting.CreatedAt != nil {
		logs = append(logs, model.VotingActionLogItem{
			ID:        "derived-created-" + voting.ID,
			Action:    "created",
			ActorName: "",
			ActorRole: "",
			Details:   "Опросник создан",
			CreatedAt: voting.CreatedAt,
		})
	}
	if voting.PublishedAt != nil {
		logs = append(logs, model.VotingActionLogItem{
			ID:        "derived-published-" + voting.ID,
			Action:    "published",
			Details:   "Опросник опубликован",
			CreatedAt: voting.PublishedAt,
		})
	}
	if voting.StoppedAt != nil {
		logs = append(logs, model.VotingActionLogItem{
			ID:        "derived-stopped-" + voting.ID,
			Action:    "stopped",
			Details:   strings.TrimSpace(voting.CompletionReason),
			CreatedAt: voting.StoppedAt,
		})
	}
	if voting.CompletedAt != nil {
		logs = append(logs, model.VotingActionLogItem{
			ID:        "derived-completed-" + voting.ID,
			Action:    "completed",
			Details:   strings.TrimSpace(voting.CompletionReason),
			CreatedAt: voting.CompletedAt,
		})
	}
	for _, owner := range owners {
		if owner.Status != "voted" || owner.VotedAt == nil {
			continue
		}
		logs = append(logs, model.VotingActionLogItem{
			ID:        "derived-owner-voted-" + voting.ID + "-" + owner.OwnerID,
			Action:    "owner_voted",
			ActorName: owner.OwnerName,
			ActorRole: "OWNER",
			Details:   fmt.Sprintf("Голосов по имуществу: %d", owner.PropertyVotes),
			CreatedAt: owner.VotedAt,
		})
	}

	rows, err := r.db.Query(ctx, `
		SELECT l.id,
		       l.action,
		       COALESCE(NULLIF(u.full_name, ''), u.email, '') AS actor_name,
		       COALESCE(l.actor_role, '') AS actor_role,
		       COALESCE(l.details::text, '') AS details,
		       l.created_at
		FROM voting_action_logs l
		LEFT JOIN users u ON u.id = l.actor_user_id
		WHERE l.voting_id = $1
		ORDER BY l.created_at DESC
	`, voting.ID)
	if err != nil {
		if strings.Contains(err.Error(), "voting_action_logs") {
			sortActionLog(logs)
			return logs, nil
		}
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var item model.VotingActionLogItem
		var createdAt time.Time
		if err := rows.Scan(&item.ID, &item.Action, &item.ActorName, &item.ActorRole, &item.Details, &createdAt); err != nil {
			return nil, err
		}
		item.CreatedAt = datetime.PtrAsAstanaWallTime(&createdAt)
		logs = append(logs, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	sortActionLog(logs)
	return logs, nil
}

func buildQuestionSummaries(voting model.Voting, owners []model.VotingOwnerSummary, totalPropertyVotes int) ([]model.VotingQuestionSummary, []string) {
	questionOrder := make([]model.Question, len(voting.Questions))
	copy(questionOrder, voting.Questions)
	result := make([]model.VotingQuestionSummary, 0, len(questionOrder))
	warnings := []string{}

	for index, question := range questionOrder {
		countedPropertyAnswers := map[string]string{}
		countedPropertyOwner := map[string]string{}
		breakdown := model.VotingQuestionAnswerBreakdown{
			For:     []model.VotingQuestionOwnerAnswer{},
			Against: []model.VotingQuestionOwnerAnswer{},
			Abstain: []model.VotingQuestionOwnerAnswer{},
		}
		for _, owner := range owners {
			answerValue := ownerAnswerForQuestion(owner.Answers, question.ID)
			if answerValue == "" {
				continue
			}

			properties := uniqueOwnerPropertyIDs(owner.Properties)
			countedForOwner := 0
			for propertyID := range properties {
				if previous, exists := countedPropertyAnswers[propertyID]; exists {
					if previous != answerValue || countedPropertyOwner[propertyID] != owner.OwnerID {
						warnings = append(warnings, fmt.Sprintf("Объект %s засчитан повторно по вопросу %d.", propertyID, index+1))
					}
					continue
				}
				countedPropertyAnswers[propertyID] = answerValue
				countedPropertyOwner[propertyID] = owner.OwnerID
				countedForOwner++
			}

			if countedForOwner > 0 {
				ownerAnswer := model.VotingQuestionOwnerAnswer{
					OwnerID:       owner.OwnerID,
					OwnerName:     owner.OwnerName,
					PropertyVotes: countedForOwner,
					Properties:    ownerPropertyNames(owner.Properties),
				}
				switch answerValue {
				case model.AnswerFor:
					breakdown.For = append(breakdown.For, ownerAnswer)
				case model.AnswerAgainst:
					breakdown.Against = append(breakdown.Against, ownerAnswer)
				case model.AnswerAbstain:
					breakdown.Abstain = append(breakdown.Abstain, ownerAnswer)
				}
			}
		}

		forVotes := countAnswers(countedPropertyAnswers, model.AnswerFor)
		againstVotes := countAnswers(countedPropertyAnswers, model.AnswerAgainst)
		abstainVotes := countAnswers(countedPropertyAnswers, model.AnswerAbstain)
		votedVotes := forVotes + againstVotes + abstainVotes
		notVoted := totalPropertyVotes - votedVotes
		if notVoted < 0 {
			notVoted = 0
			warnings = append(warnings, fmt.Sprintf("По вопросу %d голосов больше, чем подходящих объектов.", index+1))
		}

		quorumReached := votedVotes >= quorumRequired(totalPropertyVotes)
		result = append(result, model.VotingQuestionSummary{
			ID:            question.ID,
			Number:        index + 1,
			Text:          question.Text,
			ForVotes:      forVotes,
			AgainstVotes:  againstVotes,
			AbstainVotes:  abstainVotes,
			NotVotedVotes: notVoted,
			ForPercent:    percent(forVotes, totalPropertyVotes),
			Result:        questionResult(totalPropertyVotes, quorumReached, forVotes, againstVotes, abstainVotes),
			Details:       breakdown,
		})
	}

	return result, uniqueStrings(warnings)
}

func votingParticipationByProperty(owners []model.VotingOwnerSummary) (map[string]bool, []string) {
	votedProperties := map[string]bool{}
	votedPropertyOwner := map[string]string{}
	warnings := []string{}

	for _, owner := range owners {
		for _, property := range owner.Properties {
			if owner.Status != "voted" {
				continue
			}
			if previousOwner, exists := votedPropertyOwner[property.ID]; exists && previousOwner != owner.OwnerID {
				warnings = append(warnings, fmt.Sprintf("Объект %s засчитан несколькими собственниками.", property.ID))
			}
			votedPropertyOwner[property.ID] = owner.OwnerID
			votedProperties[property.ID] = true
		}
	}

	return votedProperties, uniqueStrings(warnings)
}

func buildSummaryListItem(voting model.Voting, owners []model.VotingOwnerSummary, totalPropertyVotes, votedPropertyVotes, acceptedQuestions, totalQuestions int, warnings []string) model.VotingSummaryListItem {
	votedOwners := 0
	signedOwners := 0
	pdfFormedOwners := 0
	for _, owner := range owners {
		if owner.Status == "voted" {
			votedOwners++
			if owner.Signature.Status == "signed" {
				signedOwners++
			}
			if owner.PDFStatus == "formed" {
				pdfFormedOwners++
			}
		}
	}
	quorum := quorumRequired(totalPropertyVotes)
	missing := quorum - votedPropertyVotes
	if missing < 0 {
		missing = 0
	}
	notVoted := totalPropertyVotes - votedPropertyVotes
	if notVoted < 0 {
		notVoted = 0
	}
	riskLevel, riskReasons := riskForVoting(voting, totalPropertyVotes, votedPropertyVotes, warnings, owners)
	return model.VotingSummaryListItem{
		ID:                    voting.ID,
		Title:                 voting.Title,
		Version:               voting.Version,
		Category:              normalizedCategory(voting.Category),
		Status:                summaryStatus(voting),
		StatusLabel:           summaryStatusLabel(voting),
		PublicationStartAt:    voting.PublicationStartAt,
		PublicationEndAt:      voting.PublicationEndAt,
		CompletedAt:           voting.CompletedAt,
		StoppedAt:             voting.StoppedAt,
		QuestionsCount:        len(voting.Questions),
		EligibleOwnersCount:   len(owners),
		VotedOwnersCount:      votedOwners,
		TotalPropertyVotes:    totalPropertyVotes,
		VotedPropertyVotes:    votedPropertyVotes,
		NotVotedPropertyVotes: notVoted,
		ParticipationPercent:  percent(votedPropertyVotes, totalPropertyVotes),
		QuorumRequiredVotes:   quorum,
		HasQuorum:             votedPropertyVotes >= quorum && quorum > 0,
		QuorumMissingVotes:    missing,
		AcceptedQuestions:     acceptedQuestions,
		TotalQuestions:        totalQuestions,
		SignedOwnersCount:     signedOwners,
		PDFFormedOwnersCount:  pdfFormedOwners,
		RiskLevel:             riskLevel,
		RiskReasons:           riskReasons,
		Warnings:              warnings,
	}
}

func buildDetailHeader(core summaryCore) model.VotingSummaryDetailHeader {
	item := core.Item
	meetingID := ""
	meetingLocation := ""
	var meetingScheduledAt *time.Time
	if core.Voting.Meeting != nil {
		meetingID = core.Voting.Meeting.ID
		meetingLocation = core.Voting.Meeting.Location
		meetingScheduledAt = &core.Voting.Meeting.ScheduledAt
	}
	daysLeft := daysLeft(core.Voting)
	return model.VotingSummaryDetailHeader{
		ID:                    item.ID,
		Title:                 item.Title,
		Version:               item.Version,
		Category:              item.Category,
		Status:                item.Status,
		StatusLabel:           item.StatusLabel,
		MeetingID:             meetingID,
		MeetingLocation:       meetingLocation,
		MeetingScheduledAt:    meetingScheduledAt,
		PublicationStartAt:    item.PublicationStartAt,
		PublicationEndAt:      item.PublicationEndAt,
		CompletedAt:           item.CompletedAt,
		StoppedAt:             item.StoppedAt,
		QuestionsCount:        item.QuestionsCount,
		EligibleOwnersCount:   item.EligibleOwnersCount,
		VotedOwnersCount:      item.VotedOwnersCount,
		NotVotedOwnersCount:   len(core.NotVoted),
		TotalPropertyVotes:    item.TotalPropertyVotes,
		VotedPropertyVotes:    item.VotedPropertyVotes,
		NotVotedPropertyVotes: item.NotVotedPropertyVotes,
		ParticipationPercent:  item.ParticipationPercent,
		QuorumRequiredVotes:   item.QuorumRequiredVotes,
		HasQuorum:             item.HasQuorum,
		QuorumMissingVotes:    item.QuorumMissingVotes,
		DaysLeft:              daysLeft,
		AcceptedQuestions:     item.AcceptedQuestions,
		RejectedQuestions:     item.TotalQuestions - item.AcceptedQuestions,
		RiskLevel:             item.RiskLevel,
		RiskReasons:           item.RiskReasons,
		Warnings:              item.Warnings,
	}
}

func buildOverview(header model.VotingSummaryDetailHeader, notifications model.VotingNotificationSummary, actionLogCount int) model.VotingSummaryOverview {
	return model.VotingSummaryOverview{
		Participation: model.VotingOverviewMetric{
			Title: "Участие",
			Value: fmt.Sprintf("%d / %d", header.VotedPropertyVotes, header.TotalPropertyVotes),
			Hint:  fmt.Sprintf("%d собственников / %.2f%%", header.VotedOwnersCount, header.ParticipationPercent),
			State: "info",
		},
		Quorum: model.VotingOverviewMetric{
			Title: "Кворум",
			Value: mapBoolLabel(header.HasQuorum, "Есть", "Нет"),
			Hint:  fmt.Sprintf("До кворума не хватает: %d голосов", header.QuorumMissingVotes),
			State: mapBoolLabel(header.HasQuorum, "success", "warning"),
		},
		Timeline: model.VotingOverviewMetric{
			Title: "Сроки",
			Value: header.StatusLabel,
			Hint:  timelineHint(header),
			State: "info",
		},
		Decisions: model.VotingOverviewMetric{
			Title: "Решения",
			Value: fmt.Sprintf("%d из %d принято", header.AcceptedQuestions, header.QuestionsCount),
			Hint:  fmt.Sprintf("%d не принято", header.RejectedQuestions),
			State: "info",
		},
		Documents: model.VotingOverviewMetric{
			Title: "Документы",
			Value: "HTML/CSV готовы",
			Hint:  "Подписанные PDF не сформированы в текущей схеме",
			State: "warning",
			Items: []string{"Итоговый print view", "CSV-экспорт", "ЭЦП по submissions"},
		},
		Problems: model.VotingOverviewMetric{
			Title: "Проблемы",
			Value: fmt.Sprintf("%d", len(header.RiskReasons)+len(header.Warnings)),
			Hint:  fmt.Sprintf("Уведомлений: %d, событий журнала: %d", notifications.Sent, actionLogCount),
			State: riskState(header.RiskLevel),
		},
		TotalPropertyVotes:    header.TotalPropertyVotes,
		VotedPropertyVotes:    header.VotedPropertyVotes,
		NotVotedPropertyVotes: header.NotVotedPropertyVotes,
		ParticipationPercent:  header.ParticipationPercent,
	}
}

func buildDocuments(core summaryCore) model.VotingDocumentsSummary {
	votedOwners := 0
	signedOwners := 0
	for _, owner := range core.Owners {
		if owner.Status == "voted" {
			votedOwners++
			if owner.Signature.Status == "signed" {
				signedOwners++
			}
		}
	}
	return model.VotingDocumentsSummary{
		Items: []model.VotingDocumentItem{
			{Code: "summary_report", Title: "Итоговый отчёт по опроснику", Status: "available", Available: true, Description: "HTML print view"},
			{Code: "voted_registry", Title: "Реестр проголосовавших", Status: "available", Available: true, Description: fmt.Sprintf("%d собственников", votedOwners)},
			{Code: "not_voted_registry", Title: "Реестр не голосовавших", Status: "available", Available: true, Description: fmt.Sprintf("%d собственников", len(core.NotVoted))},
			{Code: "question_results", Title: "Итоги по вопросам", Status: "available", Available: true, Description: fmt.Sprintf("%d вопросов", len(core.Questions))},
			{Code: "signed_owner_pdfs", Title: "Подписанные PDF-опросники собственников", Status: "not_formed", Available: false, Description: fmt.Sprintf("ЭЦП: %d из %d", signedOwners, votedOwners)},
			{Code: "notification_log", Title: "Журнал уведомлений", Status: "available", Available: true, Description: fmt.Sprintf("%d событий", len(core.Notifications.Events))},
			{Code: "action_log", Title: "Журнал действий", Status: "available", Available: true, Description: fmt.Sprintf("%d событий", len(core.ActionLog))},
			{Code: "archive_zip", Title: "Архивный ZIP", Status: "not_implemented", Available: false, Description: "ZIP-архив не реализован в текущей версии"},
		},
	}
}

func buildProcedure(core summaryCore) model.VotingProcedureSummary {
	voting := core.Voting
	item := core.Item
	checks := []model.VotingProcedureCheck{
		procedureCheck("meeting_linked", "Опросник связан с собранием", voting.Meeting != nil, ""),
		procedureCheck("meeting_date", "Дата собрания указана", voting.Meeting != nil && !voting.Meeting.ScheduledAt.IsZero(), ""),
		procedureCheck("publication_date", "Дата публикации указана", voting.PublishedAt != nil || voting.PublicationStartAt != nil, ""),
		procedureCheck("completion_date", "Дата завершения указана", voting.PublicationEndAt != nil, ""),
		procedureCheck("minimum_duration", "Минимальная длительность электронного голосования соблюдена", hasMinimumDuration(voting), "Минимум 7 дней"),
		procedureCheck("deadline", "Крайний срок завершения не нарушен", completionDeadlineOK(voting), "Не позднее двух месяцев с даты собрания"),
		procedureCheck("category", "Категория опросника соответствует типам имущества", item.TotalPropertyVotes > 0, ""),
		procedureCheck("eligible_owners", "Список имеющих право голосовать сформирован", item.EligibleOwnersCount > 0, ""),
		procedureCheck("duplicates", "Дубли голосов отсутствуют", !hasWarning(core.Item.Warnings, "засчитан"), ""),
		procedureCheck("signatures", "Онлайн-голоса подписаны ЭЦП", signaturesOK(core.Owners), ""),
		procedureCheck("signature_checked", "ЭЦП проверены", signaturesOK(core.Owners), "Используется текущий статус signature_status"),
		procedureCheck("pdfs", "PDF опросных листов сформированы", ownerPDFsOK(core.Owners), "PDF-путь в текущей схеме не хранится"),
		procedureCheck("action_log", "Журнал действий есть", len(core.ActionLog) > 0, ""),
		procedureCheck("stop_reason", "Причина остановки указана, если голосование остановлено", voting.Status != model.StatusStopped || strings.TrimSpace(voting.CompletionReason) != "", ""),
	}

	status := "Нарушений процедуры не обнаружено"
	for _, check := range checks {
		if check.Status != "ok" {
			status = "Есть замечания, требующие проверки"
			break
		}
	}
	return model.VotingProcedureSummary{Status: status, Checks: checks}
}

func buildSummaryResponse(cores []summaryCore) model.VotingSummaryResponse {
	response := model.VotingSummaryResponse{
		KPI:      model.VotingSummaryKPI{},
		Meetings: []model.VotingSummaryMeeting{},
	}
	meetingByID := map[string]*model.VotingSummaryMeeting{}
	order := []string{}

	for _, core := range cores {
		item := core.Item
		response.KPI.TotalVotings++
		if item.Status == "active" {
			response.KPI.ActiveVotings++
		}
		if item.Status == "completed" {
			response.KPI.CompletedVotings++
		}
		if item.HasQuorum {
			response.KPI.QuorumReached++
		} else {
			response.KPI.QuorumMissing++
		}
		if item.RiskLevel != "low" {
			response.KPI.WithRisks++
		}

		meetingKey := "without-meeting"
		meeting := model.VotingSummaryMeeting{
			ID:       meetingKey,
			Location: "Без привязанного собрания",
			Agenda:   []string{},
			Votings:  []model.VotingSummaryListItem{},
		}
		if core.Voting.Meeting != nil {
			meetingKey = core.Voting.Meeting.ID
			meeting = model.VotingSummaryMeeting{
				ID:          core.Voting.Meeting.ID,
				ScheduledAt: &core.Voting.Meeting.ScheduledAt,
				Location:    core.Voting.Meeting.Location,
				Initiator:   core.Voting.Meeting.InitiatorName,
				MeetingForm: core.Voting.Meeting.MeetingForm,
				Agenda:      core.Voting.Meeting.Agenda,
				Votings:     []model.VotingSummaryListItem{},
			}
		}
		if _, exists := meetingByID[meetingKey]; !exists {
			meetingByID[meetingKey] = &meeting
			order = append(order, meetingKey)
		}
		meetingByID[meetingKey].Votings = append(meetingByID[meetingKey].Votings, item)
		meetingByID[meetingKey].VotingsCount = len(meetingByID[meetingKey].Votings)
	}

	for _, key := range order {
		response.Meetings = append(response.Meetings, *meetingByID[key])
	}

	return response
}

func summaryMatchesFilter(core summaryCore, filter model.VotingSummaryFilter) bool {
	item := core.Item
	if filter.Search != "" && !strings.Contains(strings.ToLower(core.SearchText), strings.ToLower(strings.TrimSpace(filter.Search))) {
		return false
	}
	if filter.Status != "" && filter.Status != "all" && item.Status != filter.Status {
		return false
	}
	if filter.Category != "" && filter.Category != "all" && item.Category != filter.Category {
		return false
	}
	if filter.Quorum != "" && filter.Quorum != "all" {
		switch filter.Quorum {
		case "has":
			if !item.HasQuorum {
				return false
			}
		case "missing":
			if item.HasQuorum {
				return false
			}
		case "almost":
			if item.HasQuorum || item.QuorumMissingVotes > int(math.Ceil(float64(item.QuorumRequiredVotes)*0.1)) {
				return false
			}
		}
	}
	if filter.Risk != "" && filter.Risk != "all" && item.RiskLevel != filter.Risk {
		return false
	}
	if !dateInRange(votingMeetingDate(core.Voting), filter.MeetingDateFrom, filter.MeetingDateTo) {
		return false
	}
	if !dateInRange(item.PublicationStartAt, filter.PublicationDateFrom, filter.PublicationDateTo) {
		return false
	}
	if !dateInRange(completionDate(core.Voting), filter.CompletionDateFrom, filter.CompletionDateTo) {
		return false
	}
	return true
}

func votingMeetingDate(voting model.Voting) *time.Time {
	if voting.Meeting == nil {
		return nil
	}
	return &voting.Meeting.ScheduledAt
}

func isSummaryVoting(voting model.Voting) bool {
	return voting.Status == model.StatusPublished ||
		voting.Status == model.StatusStopped ||
		voting.Status == model.StatusCompleted ||
		voting.Status == model.StatusExpired
}

func summarySearchText(voting model.Voting, owners []model.VotingOwnerSummary) string {
	parts := []string{voting.Title, voting.Description}
	if voting.Meeting != nil {
		parts = append(parts, voting.Meeting.Location, voting.Meeting.InitiatorName)
		parts = append(parts, voting.Meeting.Agenda...)
	}
	for _, owner := range owners {
		parts = append(parts, owner.OwnerName, owner.Email, owner.Phone, owner.PropertyLabel)
	}
	return strings.Join(parts, " ")
}

func summaryStatus(voting model.Voting) string {
	if voting.Status == model.StatusStopped {
		return "stopped"
	}
	if voting.Status == model.StatusCompleted || voting.Status == model.StatusExpired {
		return "completed"
	}
	now := datetime.Now()
	if voting.Status == model.StatusPublished && voting.PublicationEndAt != nil && now.After(*voting.PublicationEndAt) {
		return "completed"
	}
	return "active"
}

func summaryStatusLabel(voting model.Voting) string {
	switch summaryStatus(voting) {
	case "active":
		return "Идёт голосование"
	case "stopped":
		return "Остановлен"
	default:
		return "Завершён"
	}
}

func normalizedCategory(category string) string {
	if strings.TrimSpace(category) == "" {
		return model.CategoryGeneral
	}
	return strings.TrimSpace(category)
}

func propertyMatchesCategory(propertyType, category string) bool {
	switch normalizedCategory(category) {
	case model.CategoryGeneral:
		return true
	case model.CategoryApartmentsAndCommercial:
		return propertyType == "apartment" || propertyType == "commercial_room"
	case model.CategoryParkingAndStorerooms:
		return propertyType == "parking" || propertyType == "storage"
	default:
		return false
	}
}

func quorumRequired(total int) int {
	if total <= 0 {
		return 0
	}
	return total/2 + 1
}

func percent(value, total int) float64 {
	if total <= 0 {
		return 0
	}
	return math.Round((float64(value)/float64(total))*10000) / 100
}

func questionResult(total int, quorumReached bool, forVotes, againstVotes, abstainVotes int) string {
	if total <= 0 {
		return "needs_review"
	}
	if !quorumReached {
		return "not_enough_votes"
	}
	if forVotes > againstVotes+abstainVotes {
		return "accepted"
	}
	return "rejected"
}

func countAnswers(values map[string]string, answer string) int {
	count := 0
	for _, value := range values {
		if value == answer {
			count++
		}
	}
	return count
}

func riskForVoting(voting model.Voting, totalPropertyVotes, votedPropertyVotes int, warnings []string, owners []model.VotingOwnerSummary) (string, []string) {
	reasons := []string{}
	if totalPropertyVotes == 0 {
		reasons = append(reasons, "Список имеющих право голосовать пуст.")
	}
	if votedPropertyVotes < quorumRequired(totalPropertyVotes) {
		reasons = append(reasons, "Кворум не достигнут.")
	}
	if len(warnings) > 0 {
		reasons = append(reasons, "Есть несоответствия в подсчёте голосов.")
	}
	if !hasMinimumDuration(voting) {
		reasons = append(reasons, "Минимальная длительность голосования не соблюдена.")
	}
	if !completionDeadlineOK(voting) {
		reasons = append(reasons, "Крайний срок завершения требует проверки.")
	}
	missingContacts := 0
	unsigned := 0
	missingPDF := 0
	for _, owner := range owners {
		if strings.TrimSpace(owner.Email) == "" && strings.TrimSpace(owner.Phone) == "" {
			missingContacts++
		}
		if owner.Status == "voted" {
			if owner.Signature.Status != "signed" {
				unsigned++
			}
			if owner.PDFStatus != "formed" {
				missingPDF++
			}
		}
	}
	if unsigned > 0 {
		reasons = append(reasons, fmt.Sprintf("Есть неподписанные онлайн-голоса: %d.", unsigned))
	}
	if missingPDF > 0 {
		reasons = append(reasons, fmt.Sprintf("Не сформированы PDF опросных листов: %d.", missingPDF))
	}
	if missingContacts > 0 {
		reasons = append(reasons, fmt.Sprintf("Нет контактов у части собственников: %d.", missingContacts))
	}

	reasons = uniqueStrings(reasons)
	if len(reasons) == 0 {
		return "low", []string{}
	}
	for _, reason := range reasons {
		if strings.Contains(reason, "Кворум") ||
			strings.Contains(reason, "несоответствия") ||
			strings.Contains(reason, "длительность") ||
			strings.Contains(reason, "подпис") {
			return "high", reasons
		}
	}
	return "medium", reasons
}

func attachNotificationStates(owners []model.VotingOwnerSummary, states map[string]notificationState) {
	for i := range owners {
		state := states[owners[i].OwnerID]
		if state.Status == "" {
			state.Status = "not_sent"
		}
	}
}

func ownerAnswerForQuestion(answers []model.VotingOwnerAnswer, questionID string) string {
	for _, answer := range answers {
		if answer.QuestionID == questionID {
			return answer.Answer
		}
	}
	return ""
}

func uniqueOwnerPropertyIDs(properties []model.VotingOwnerProperty) map[string]bool {
	result := map[string]bool{}
	for _, property := range properties {
		result[property.ID] = true
	}
	return result
}

func ownerPropertyNames(properties []model.VotingOwnerProperty) []string {
	names := []string{}
	seen := map[string]bool{}
	for _, property := range properties {
		name := propertyTypeShortLabel(property.Type) + " " + property.Number
		if seen[name] {
			continue
		}
		seen[name] = true
		names = append(names, name)
	}
	return names
}

func ownerPropertyLabel(properties []model.VotingOwnerProperty) string {
	return strings.Join(ownerPropertyNames(properties), ", ")
}

func ownerPropertyTypes(properties []model.VotingOwnerProperty) string {
	labels := []string{}
	seen := map[string]bool{}
	for _, property := range properties {
		label := propertyTypeLabel(property.Type)
		if seen[label] {
			continue
		}
		seen[label] = true
		labels = append(labels, label)
	}
	return strings.Join(labels, ", ")
}

func ownerPropertyErcAccounts(properties []model.VotingOwnerProperty) string {
	values := []string{}
	seen := map[string]bool{}
	for _, property := range properties {
		value := strings.TrimSpace(property.ErcAccount)
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		values = append(values, value)
	}
	return strings.Join(values, ", ")
}

func propertyTypeLabel(value string) string {
	switch value {
	case "apartment":
		return "Квартира"
	case "commercial_room":
		return "НП"
	case "storage":
		return "Кладовая"
	case "parking":
		return "Паркоместо"
	default:
		return value
	}
}

func propertyTypeShortLabel(value string) string {
	switch value {
	case "apartment":
		return "кв."
	case "commercial_room":
		return "НП"
	case "storage":
		return "клад."
	case "parking":
		return "п/м"
	default:
		return value
	}
}

func notificationEventType(value string) string {
	switch value {
	case "voting_published":
		return "publication"
	case "voting_reminder":
		return "reminder"
	default:
		return value
	}
}

func completionDate(voting model.Voting) *time.Time {
	if voting.CompletedAt != nil {
		return voting.CompletedAt
	}
	if voting.StoppedAt != nil {
		return voting.StoppedAt
	}
	return voting.PublicationEndAt
}

func dateInRange(value *time.Time, from, to string) bool {
	from = strings.TrimSpace(from)
	to = strings.TrimSpace(to)
	if from == "" && to == "" {
		return true
	}
	if value == nil {
		return false
	}
	date := datetime.AsAstanaWallTime(*value)
	if from != "" {
		fromDate, err := time.ParseInLocation("2006-01-02", from, datetime.Location())
		if err == nil && date.Before(fromDate) {
			return false
		}
	}
	if to != "" {
		toDate, err := time.ParseInLocation("2006-01-02", to, datetime.Location())
		if err == nil && date.After(toDate.Add(24*time.Hour-time.Nanosecond)) {
			return false
		}
	}
	return true
}

func daysLeft(voting model.Voting) *int {
	if summaryStatus(voting) != "active" || voting.PublicationEndAt == nil {
		return nil
	}
	now := datetime.Now()
	left := int(math.Ceil(voting.PublicationEndAt.Sub(now).Hours() / 24))
	if left < 0 {
		left = 0
	}
	return &left
}

func hasMinimumDuration(voting model.Voting) bool {
	start := voting.PublishedAt
	if start == nil {
		start = voting.PublicationStartAt
	}
	if start == nil || voting.PublicationEndAt == nil {
		return false
	}
	return voting.PublicationEndAt.Sub(*start) >= 7*24*time.Hour
}

func completionDeadlineOK(voting model.Voting) bool {
	if voting.Meeting == nil || voting.PublicationEndAt == nil {
		return false
	}
	deadline := voting.Meeting.ScheduledAt.AddDate(0, 2, 0)
	return !voting.PublicationEndAt.After(deadline.Add(24*time.Hour - time.Nanosecond))
}

func signaturesOK(owners []model.VotingOwnerSummary) bool {
	for _, owner := range owners {
		if owner.Status == "voted" && owner.Signature.Status != "signed" {
			return false
		}
	}
	return true
}

func ownerPDFsOK(owners []model.VotingOwnerSummary) bool {
	for _, owner := range owners {
		if owner.Status == "voted" && owner.PDFStatus != "formed" {
			return false
		}
	}
	return true
}

func procedureCheck(code, title string, ok bool, comment string) model.VotingProcedureCheck {
	status := "ok"
	if !ok {
		status = "warning"
	}
	return model.VotingProcedureCheck{Code: code, Title: title, Status: status, Comment: comment}
}

func hasWarning(warnings []string, part string) bool {
	for _, warning := range warnings {
		if strings.Contains(warning, part) {
			return true
		}
	}
	return false
}

func timelineHint(header model.VotingSummaryDetailHeader) string {
	if header.DaysLeft != nil {
		return fmt.Sprintf("Осталось дней: %d", *header.DaysLeft)
	}
	if header.StoppedAt != nil {
		return "Голосование остановлено"
	}
	return "Период голосования завершён"
}

func riskState(risk string) string {
	switch risk {
	case "low":
		return "success"
	case "medium":
		return "warning"
	default:
		return "danger"
	}
}

func mapBoolLabel(value bool, yes, no string) string {
	if value {
		return yes
	}
	return no
}

func sortActionLog(logs []model.VotingActionLogItem) {
	sort.SliceStable(logs, func(i, j int) bool {
		left := logs[i].CreatedAt
		right := logs[j].CreatedAt
		if left == nil {
			return false
		}
		if right == nil {
			return true
		}
		return left.After(*right)
	})
}

func uniqueStrings(values []string) []string {
	seen := map[string]bool{}
	result := []string{}
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		result = append(result, value)
	}
	return result
}

func nullStringValue(value sql.NullString) string {
	if !value.Valid {
		return ""
	}
	return value.String
}

func nullFloatPtr(value sql.NullFloat64) *float64 {
	if !value.Valid {
		return nil
	}
	result := value.Float64
	return &result
}

func insertVotingActionLog(ctx context.Context, tx pgx.Tx, votingID, actorUserID, actorRole, action, details string, createdAt time.Time) error {
	detailsPayload := map[string]string{"message": strings.TrimSpace(details)}
	payload, err := json.Marshal(detailsPayload)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `
		INSERT INTO voting_action_logs (id, voting_id, actor_user_id, actor_role, action, details, created_at)
		VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
	`, fmt.Sprintf("voting-log-%s-%d", votingID, time.Now().UnixNano()), votingID, nullActorID(actorUserID), actorRole, action, string(payload), createdAt)
	return err
}

func nullActorID(actorUserID string) *string {
	actorUserID = strings.TrimSpace(actorUserID)
	if actorUserID == "" {
		return nil
	}
	return &actorUserID
}
