package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"golosdom-backend/internal/common/datetime"
	"golosdom-backend/internal/voting/dto"
	"golosdom-backend/internal/voting/model"
	"golosdom-backend/internal/voting/repository"
)

type Service struct {
	repo *repository.Repository
}

const minPublicationVotingDays = 7

func New(repo *repository.Repository) *Service {
	return &Service{repo: repo}
}

func (s *Service) List(status string) ([]model.Voting, error) {
	if status != "" && !validVotingStatus(status) {
		return nil, errors.New("invalid voting status")
	}
	return s.repo.List(context.Background(), status)
}

func (s *Service) Get(id string) (model.Voting, error) {
	return s.repo.Get(context.Background(), id)
}

func (s *Service) Create(createdBy, title, description, question string, options []string) (model.Voting, error) {
	req := dto.SaveDraftRequest{
		Title:       title,
		Description: description,
		Questions: []dto.QuestionRequest{{
			Text:    question,
			Options: options,
		}},
	}
	return s.SaveDraft(createdBy, req)
}

func (s *Service) SaveDraft(createdBy string, req dto.SaveDraftRequest) (model.Voting, error) {
	voting, err := buildVoting("", createdBy, req)
	if err != nil {
		return model.Voting{}, err
	}
	if err := s.repo.SaveDraft(context.Background(), voting); err != nil {
		return model.Voting{}, err
	}
	return s.repo.Get(context.Background(), voting.ID)
}

func (s *Service) UpdateDraft(id, userID string, req dto.SaveDraftRequest) (model.Voting, error) {
	current, err := s.repo.Get(context.Background(), id)
	if err != nil {
		return model.Voting{}, err
	}
	if current.Status != model.StatusDraft && current.Status != model.StatusRevisionRequired {
		return model.Voting{}, errors.New("only draft or revision voting can be edited")
	}

	voting, err := buildVoting(id, current.CreatedBy, req)
	if err != nil {
		return model.Voting{}, err
	}
	voting.Status = current.Status
	voting.Version = current.Version
	if voting.Version < 1 {
		voting.Version = 1
	}
	if current.Status == model.StatusRevisionRequired && req.MeetingID == nil {
		voting.MeetingID = current.MeetingID
	}

	if err := s.repo.UpdateDraft(context.Background(), voting); err != nil {
		return model.Voting{}, err
	}
	return s.repo.Get(context.Background(), id)
}

func (s *Service) Delete(id string) error {
	voting, err := s.repo.Get(context.Background(), id)
	if err != nil {
		return err
	}
	if voting.Status != model.StatusDraft &&
		voting.Status != model.StatusRevisionRequired &&
		!(voting.Status == model.StatusPendingPublish && isPublicationSchedulingExpired(voting, datetime.Now())) {
		return errors.New("voting cannot be deleted")
	}

	return s.repo.Delete(context.Background(), id)
}

func (s *Service) SubmitToCouncil(id string) (model.Voting, string, error) {
	voting, err := s.repo.Get(context.Background(), id)
	if err != nil {
		return model.Voting{}, "", err
	}
	if voting.Meeting == nil {
		return model.Voting{}, "", errors.New("meeting is required before council review")
	}
	if len(voting.Questions) == 0 {
		return model.Voting{}, "", errors.New("at least one question is required")
	}

	deadline, warning := calculateDeadline(voting.Meeting.ScheduledAt)
	version := voting.Version
	if version < 1 {
		version = 1
	}

	if err := s.repo.SubmitToCouncil(context.Background(), voting.ID, version, deadline); err != nil {
		return model.Voting{}, "", err
	}

	updated, err := s.repo.Get(context.Background(), id)
	return updated, warning, err
}

func (s *Service) ResubmitToCouncil(id string) (model.Voting, string, error) {
	voting, err := s.repo.Get(context.Background(), id)
	if err != nil {
		return model.Voting{}, "", err
	}
	if voting.Status != model.StatusRevisionRequired {
		return model.Voting{}, "", errors.New("only revision voting can be resubmitted")
	}
	if voting.Meeting == nil {
		return model.Voting{}, "", errors.New("meeting is required before council review")
	}

	deadline, warning := calculateDeadline(voting.Meeting.ScheduledAt)
	version := voting.Version + 1
	if version < 2 {
		version = 2
	}

	if err := s.repo.SubmitToCouncil(context.Background(), voting.ID, version, deadline); err != nil {
		return model.Voting{}, "", err
	}

	updated, err := s.repo.Get(context.Background(), id)
	return updated, warning, err
}

func (s *Service) SchedulePublication(id string, req dto.SchedulePublicationRequest) (model.Voting, error) {
	voting, err := s.repo.Get(context.Background(), id)
	if err != nil {
		return model.Voting{}, err
	}
	if voting.Status != model.StatusPendingPublish {
		return model.Voting{}, errors.New("only pending publication voting can be scheduled")
	}
	if voting.MeetingID == nil || voting.Meeting == nil || voting.Meeting.ScheduledAt.IsZero() {
		return model.Voting{}, errors.New("У опросника нет привязанного собрания.")
	}

	startAt, err := parsePublicationDateTime(req.StartAt)
	if err != nil {
		return model.Voting{}, errors.New("invalid publication start date")
	}
	endAt, err := parsePublicationDateTime(req.EndAt)
	if err != nil {
		return model.Voting{}, errors.New("invalid publication end date")
	}

	if err := validatePublicationSchedule(voting.Meeting.ScheduledAt, startAt, endAt); err != nil {
		return model.Voting{}, err
	}

	if err := s.repo.SchedulePublication(context.Background(), id, startAt, endAt, req.SendNotifications); err != nil {
		return model.Voting{}, err
	}
	return s.repo.Get(context.Background(), id)
}

func (s *Service) CurrentApproval(id string) (model.ApprovalReview, error) {
	return s.repo.CurrentApproval(context.Background(), id)
}

func (s *Service) Vote(votingID, userID string, req dto.ApprovalVoteRequest) (model.ApprovalReview, error) {
	req.Decision = strings.TrimSpace(req.Decision)
	req.Reason = strings.TrimSpace(req.Reason)
	req.Comment = strings.TrimSpace(req.Comment)

	if req.Decision != model.DecisionApprove && req.Decision != model.DecisionRevision {
		return model.ApprovalReview{}, errors.New("invalid decision")
	}

	review, err := s.repo.CurrentApproval(context.Background(), votingID)
	if err != nil {
		return model.ApprovalReview{}, err
	}
	if userAlreadyVoted(review.Votes, userID) {
		return review, nil
	}

	voting, err := s.repo.Get(context.Background(), votingID)
	if err != nil {
		return model.ApprovalReview{}, err
	}
	if voting.Status != model.StatusCouncilReview {
		return model.ApprovalReview{}, errors.New("voting is not in council review")
	}
	if review.Status != model.ReviewInProgress {
		return model.ApprovalReview{}, errors.New("approval review is not in progress")
	}

	if req.Decision == model.DecisionRevision {
		if req.Reason == "" || req.Comment == "" {
			req.Reason, req.Comment = firstRevisionDetails(review.Votes)
		}
		if req.Reason == "" || req.Comment == "" {
			return model.ApprovalReview{}, errors.New("reason and comment are required for first revision vote")
		}
		if !validRevisionReason(req.Reason) {
			return model.ApprovalReview{}, errors.New("invalid revision reason")
		}
	}

	vote := model.ApprovalVote{
		ID:       fmt.Sprintf("%s-vote-%s-%d", review.ID, userID, time.Now().UnixNano()),
		ReviewID: review.ID,
		VotingID: votingID,
		UserID:   userID,
		Decision: req.Decision,
		Comment:  req.Comment,
		Reason:   req.Reason,
	}

	return s.repo.Vote(context.Background(), review, vote)
}

func userAlreadyVoted(votes []model.ApprovalVote, userID string) bool {
	for _, vote := range votes {
		if vote.UserID == userID {
			return true
		}
	}
	return false
}

func firstRevisionDetails(votes []model.ApprovalVote) (string, string) {
	for _, vote := range votes {
		if vote.Decision == model.DecisionRevision && vote.Reason != "" && vote.Comment != "" {
			return vote.Reason, vote.Comment
		}
	}
	return "", ""
}

func buildVoting(id, createdBy string, req dto.SaveDraftRequest) (model.Voting, error) {
	title := strings.TrimSpace(req.Title)
	if title == "" {
		title = "Опросный лист"
	}

	questions := make([]model.Question, 0, len(req.Questions))
	for i, item := range req.Questions {
		text := strings.TrimSpace(item.Text)
		if text == "" {
			continue
		}

		options := make([]string, 0, len(item.Options))
		for _, option := range item.Options {
			option = strings.TrimSpace(option)
			if option != "" {
				options = append(options, option)
			}
		}
		if len(options) == 0 {
			options = []string{"Да", "Нет", "Воздержался"}
		}

		questionID := strings.TrimSpace(item.ID)
		if questionID == "" && id != "" {
			questionID = fmt.Sprintf("%s-question-%d", id, i+1)
		}

		questions = append(questions, model.Question{
			ID:      questionID,
			Text:    text,
			Options: options,
		})
	}

	if len(questions) == 0 {
		return model.Voting{}, errors.New("at least one question is required")
	}

	if id == "" {
		id = fmt.Sprintf("voting-%d", time.Now().UnixNano())
	}

	return model.Voting{
		ID:          id,
		Title:       title,
		Description: strings.TrimSpace(req.Description),
		Status:      model.StatusDraft,
		CreatedBy:   createdBy,
		MeetingID:   normalizeID(req.MeetingID),
		Version:     1,
		Questions:   questions,
	}, nil
}

func calculateDeadline(scheduledAt time.Time) (time.Time, string) {
	deadline := scheduledAt.Add(-24 * time.Hour)
	now := datetime.Now()
	if deadline.After(now) {
		return deadline, ""
	}

	fallback := now.Add(30 * time.Minute)
	warning := "До даты собрания осталось меньше 24 часов. Дедлайн согласования установлен на ближайшее допустимое время."
	if scheduledAt.After(now) && fallback.After(scheduledAt) {
		fallback = scheduledAt.Add(-1 * time.Minute)
	}
	if fallback.Before(now) {
		fallback = now
	}
	return fallback, warning
}

func parsePublicationDateTime(value string) (time.Time, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return time.Time{}, errors.New("empty date")
	}

	return datetime.ParseAstanaDateTime(value)
}

func validatePublicationSchedule(meetingAt, startAt, endAt time.Time) error {
	meetingDate := dateOnly(meetingAt)
	earliestStartDate := meetingDate.AddDate(0, 0, 1)
	finalDeadlineDate := meetingDate.AddDate(0, 2, 0)
	finalDeadlineEnd := endOfDay(finalDeadlineDate)
	latestStartDate := finalDeadlineDate.AddDate(0, 0, -minPublicationVotingDays)

	if startAt.Before(earliestStartDate) {
		return fmt.Errorf("Дата начала не может быть раньше %s.", formatPublicationDate(earliestStartDate))
	}
	if startAt.After(endOfDay(latestStartDate)) {
		return errors.New("Нельзя выбрать эту дату начала: 7 дней голосования не помещаются в допустимый срок.")
	}
	if startAt.AddDate(0, 0, minPublicationVotingDays).After(finalDeadlineEnd) {
		return errors.New("Нельзя выбрать эту дату начала: 7 дней голосования не помещаются в допустимый срок.")
	}
	if endAt.Before(startAt.AddDate(0, 0, minPublicationVotingDays)) {
		return fmt.Errorf("Минимальная длительность голосования — %d дней.", minPublicationVotingDays)
	}
	if endAt.After(finalDeadlineEnd) {
		return fmt.Errorf("Дата завершения не может быть позже %s.", formatPublicationDate(finalDeadlineDate))
	}

	return nil
}

func isPublicationSchedulingExpired(voting model.Voting, now time.Time) bool {
	if voting.Meeting == nil {
		return false
	}
	if voting.PublicationStatus == model.PublicationScheduled ||
		voting.PublicationStatus == model.PublicationPublished {
		return false
	}

	meetingDate := dateOnly(voting.Meeting.ScheduledAt)
	latestStartDate := meetingDate.AddDate(0, 2, -minPublicationVotingDays)
	return now.After(endOfDay(latestStartDate))
}

func dateOnly(value time.Time) time.Time {
	value = datetime.AsAstanaWallTime(value)
	year, month, day := value.Date()
	return time.Date(year, month, day, 0, 0, 0, 0, value.Location())
}

func endOfDay(value time.Time) time.Time {
	value = datetime.AsAstanaWallTime(value)
	year, month, day := value.Date()
	return time.Date(year, month, day, 23, 59, 59, int(time.Second-time.Nanosecond), value.Location())
}

func formatPublicationDate(value time.Time) string {
	return value.Format("02.01.2006")
}

func normalizeID(id *string) *string {
	if id == nil {
		return nil
	}
	value := strings.TrimSpace(*id)
	if value == "" {
		return nil
	}
	return &value
}

func validVotingStatus(status string) bool {
	switch status {
	case model.StatusDraft, model.StatusCouncilReview, model.StatusRevisionRequired, model.StatusPendingPublish, model.StatusPublished:
		return true
	default:
		return false
	}
}

func validRevisionReason(reason string) bool {
	switch reason {
	case "unclear_wording", "data_error", "procedure_violation", "missing_documents", "other":
		return true
	default:
		return false
	}
}
