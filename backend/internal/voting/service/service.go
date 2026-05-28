package service

import (
	"context"
	"errors"
	"fmt"
	"html"
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

func (s *Service) List(status, userID string) ([]model.Voting, error) {
	if status != "" && !validVotingStatus(status) {
		return nil, errors.New("invalid voting status")
	}
	return s.repo.List(context.Background(), status, userID)
}

func (s *Service) Get(id string) (model.Voting, error) {
	return s.repo.Get(context.Background(), id)
}

func (s *Service) GetForUser(id, userID string) (model.Voting, error) {
	return s.repo.GetForUser(context.Background(), id, userID)
}

func (s *Service) Create(createdBy, title, description, category, question string, options []string) (model.Voting, error) {
	req := dto.SaveDraftRequest{
		Title:       title,
		Description: description,
		Category:    category,
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
	endAt := publicationDeadline(voting.Meeting.ScheduledAt)
	minStopAt := startAt.AddDate(0, 0, minPublicationVotingDays)

	if err := validatePublicationSchedule(voting.Meeting.ScheduledAt, startAt, endAt); err != nil {
		return model.Voting{}, err
	}

	if err := s.repo.SchedulePublication(context.Background(), id, startAt, endAt, minStopAt, true); err != nil {
		return model.Voting{}, err
	}
	return s.repo.Get(context.Background(), id)
}

func (s *Service) StopVoting(id, reason string) (model.Voting, error) {
	reason = strings.TrimSpace(reason)
	if reason == "" {
		return model.Voting{}, errors.New("Укажите причину остановки голосования.")
	}

	voting, err := s.repo.Get(context.Background(), id)
	if err != nil {
		return model.Voting{}, err
	}
	if voting.Status != model.StatusPublished {
		return model.Voting{}, errors.New("voting is not active")
	}
	startAt := actualVotingStartAt(voting)
	if startAt == nil || voting.PublicationEndAt == nil {
		return model.Voting{}, errors.New("voting publication dates are not set")
	}

	now := datetime.Now()
	minStopAt := startAt.AddDate(0, 0, minPublicationVotingDays)
	if now.Before(minStopAt) {
		return model.Voting{}, fmt.Errorf("Остановить можно после минимального срока голосования — %d дней.", minPublicationVotingDays)
	}

	if now.After(*voting.PublicationEndAt) {
		return model.Voting{}, errors.New("voting is not active")
	}

	if err := s.repo.StopVoting(context.Background(), id, now, reason); err != nil {
		return model.Voting{}, err
	}
	return s.repo.Get(context.Background(), id)
}

func (s *Service) SubmitOwnerVote(votingID, userID string, req dto.OwnerVoteRequest) ([]model.OwnerVotingAnswer, error) {
	if strings.TrimSpace(userID) == "" {
		return nil, errors.New("missing user")
	}

	signatureMethod := strings.TrimSpace(req.SignatureMethod)
	if signatureMethod == "" {
		signatureMethod = model.SignatureMockMGov
	}
	if signatureMethod != model.SignatureMockMGov && signatureMethod != model.SignatureMockECP {
		return nil, errors.New("invalid signature method")
	}

	voting, err := s.repo.GetForUser(context.Background(), votingID, userID)
	if err != nil {
		return nil, err
	}

	canVoteCategory, err := s.repo.OwnerCanVoteCategory(context.Background(), userID, voting.Category)
	if err != nil {
		return nil, err
	}
	if !canVoteCategory {
		return nil, errors.New("У пользователя нет права голосовать по данному опроснику.")
	}

	alreadyVoted, err := s.repo.OwnerAlreadyVoted(context.Background(), votingID, userID)
	if err != nil {
		return nil, err
	}
	if alreadyVoted {
		return nil, errors.New("Вы уже проголосовали по данному опроснику.")
	}

	if err := validateOwnerVotingIsActive(voting, datetime.Now()); err != nil {
		return nil, err
	}

	answers, err := validateOwnerVoteAnswers(voting, req.Answers)
	if err != nil {
		return nil, err
	}

	signedAt := datetime.Now()
	if err := s.repo.SubmitOwnerVote(context.Background(), votingID, userID, signatureMethod, signedAt, answers); err != nil {
		if errors.Is(err, repository.ErrOwnerAlreadyVoted) {
			return nil, errors.New("Вы уже проголосовали по данному опроснику.")
		}
		return nil, err
	}

	return s.repo.OwnerAnswers(context.Background(), votingID, userID)
}

func (s *Service) SubmitOwnerVoteBatch(userID string, req dto.OwnerBatchVoteRequest) ([]model.OwnerVotingAnswer, error) {
	if strings.TrimSpace(userID) == "" {
		return nil, errors.New("missing user")
	}

	meetingID := strings.TrimSpace(req.MeetingID)
	if meetingID == "" {
		return nil, errors.New("meeting_id is required")
	}

	signatureMethod := strings.TrimSpace(req.SignatureMethod)
	if signatureMethod == "" {
		signatureMethod = model.SignatureMockMGov
	}
	if signatureMethod != model.SignatureMockMGov && signatureMethod != model.SignatureMockECP {
		return nil, errors.New("invalid signature method")
	}

	if len(req.VotingIDs) == 0 {
		return nil, errors.New("Выберите хотя бы один опросник.")
	}

	requestAnswers := make(map[string][]dto.OwnerVoteAnswerRequest, len(req.Answers))
	for _, item := range req.Answers {
		votingID := strings.TrimSpace(item.VotingID)
		if votingID == "" {
			return nil, errors.New("voting_id is required")
		}
		requestAnswers[votingID] = item.Answers
	}

	seenVotingIDs := make(map[string]bool, len(req.VotingIDs))
	answersByVotingID := make(map[string][]model.OwnerVotingAnswer, len(req.VotingIDs))
	now := datetime.Now()
	for _, rawVotingID := range req.VotingIDs {
		votingID := strings.TrimSpace(rawVotingID)
		if votingID == "" {
			return nil, errors.New("voting_id is required")
		}
		if seenVotingIDs[votingID] {
			return nil, errors.New("Опросники в пакете не должны повторяться.")
		}
		seenVotingIDs[votingID] = true

		voting, err := s.repo.GetForUser(context.Background(), votingID, userID)
		if err != nil {
			return nil, err
		}
		if voting.MeetingID == nil || strings.TrimSpace(*voting.MeetingID) != meetingID {
			return nil, errors.New("Все опросники пакета должны относиться к одному собранию.")
		}

		canVoteCategory, err := s.repo.OwnerCanVoteCategory(context.Background(), userID, voting.Category)
		if err != nil {
			return nil, err
		}
		if !canVoteCategory {
			return nil, errors.New("У пользователя нет права голосовать по одному из выбранных опросников.")
		}

		alreadyVoted, err := s.repo.OwnerAlreadyVoted(context.Background(), votingID, userID)
		if err != nil {
			return nil, err
		}
		if alreadyVoted {
			return nil, errors.New("Вы уже проголосовали по одному из выбранных опросников.")
		}

		if err := validateOwnerVotingIsActive(voting, now); err != nil {
			return nil, err
		}

		answers, ok := requestAnswers[votingID]
		if !ok {
			return nil, errors.New("Для каждого выбранного опросника нужны ответы.")
		}
		validatedAnswers, err := validateOwnerVoteAnswers(voting, answers)
		if err != nil {
			return nil, err
		}
		answersByVotingID[votingID] = validatedAnswers
	}

	if len(answersByVotingID) != len(req.VotingIDs) {
		return nil, errors.New("Для каждого выбранного опросника нужны ответы.")
	}

	signedAt := datetime.Now()
	if err := s.repo.SubmitOwnerVoteBatch(context.Background(), userID, signatureMethod, signedAt, answersByVotingID); err != nil {
		if errors.Is(err, repository.ErrOwnerAlreadyVoted) {
			return nil, errors.New("Вы уже проголосовали по одному из выбранных опросников.")
		}
		return nil, err
	}

	result := make([]model.OwnerVotingAnswer, 0)
	for _, votingID := range req.VotingIDs {
		answers, err := s.repo.OwnerAnswers(context.Background(), strings.TrimSpace(votingID), userID)
		if err != nil {
			return nil, err
		}
		result = append(result, answers...)
	}
	return result, nil
}

func (s *Service) OwnerAnswers(votingID, userID string) ([]model.OwnerVotingAnswer, error) {
	if _, err := s.repo.GetForUser(context.Background(), votingID, userID); err != nil {
		return nil, err
	}

	answers, err := s.repo.OwnerAnswers(context.Background(), votingID, userID)
	if err != nil {
		return nil, err
	}
	if len(answers) == 0 {
		return nil, errors.New("Вы еще не голосовали по данному опроснику.")
	}
	return answers, nil
}

func (s *Service) VotingResults(votingID string) ([]model.VotingResult, error) {
	if _, err := s.repo.Get(context.Background(), votingID); err != nil {
		return nil, err
	}
	return s.repo.VotingResults(context.Background(), votingID)
}

func (s *Service) VotingBlankHTML(votingID, userID string) (string, string, error) {
	blank, err := s.repo.VotingBlank(context.Background(), votingID, userID)
	if err != nil {
		return "", "", err
	}

	title := strings.TrimSpace(blank.Voting.Title)
	if title == "" {
		title = "Опросный лист"
	}

	var builder strings.Builder
	builder.WriteString("<!doctype html><html><head><meta charset=\"utf-8\"><title>")
	builder.WriteString(html.EscapeString(title))
	builder.WriteString("</title><style>body{font-family:Arial,sans-serif;line-height:1.45;color:#0f172a;padding:32px;}h1{font-size:24px;margin:0 0 16px;}h2{font-size:18px;margin:24px 0 8px;}table{width:100%;border-collapse:collapse;margin-top:12px;}td,th{border:1px solid #cbd5e1;padding:10px;text-align:left;vertical-align:top}.muted{color:#475569}.sign{margin-top:36px;display:grid;grid-template-columns:1fr 1fr;gap:24px}.line{border-bottom:1px solid #0f172a;height:28px}</style></head><body>")
	builder.WriteString("<h1>")
	builder.WriteString(html.EscapeString(title))
	builder.WriteString("</h1>")

	if blank.BuildingName != "" {
		builder.WriteString("<p><strong>ОСИ/ЖК:</strong> ")
		builder.WriteString(html.EscapeString(blank.BuildingName))
		builder.WriteString("</p>")
	}
	if blank.PropertyLabel != "" {
		builder.WriteString("<p><strong>Объект имущества:</strong> ")
		builder.WriteString(html.EscapeString(blank.PropertyLabel))
		builder.WriteString("</p>")
	}
	builder.WriteString("<p><strong>ФИО собственника:</strong> ")
	builder.WriteString(html.EscapeString(blank.OwnerName))
	builder.WriteString("</p>")
	if blank.Voting.Meeting != nil {
		builder.WriteString("<p><strong>Дата собрания:</strong> ")
		builder.WriteString(html.EscapeString(blank.Voting.Meeting.ScheduledAt.Format("02.01.2006 15:04")))
		builder.WriteString("</p>")
	}
	if blank.Voting.PublicationEndAt != nil {
		builder.WriteString("<p><strong>Крайний срок голосования:</strong> ")
		builder.WriteString(html.EscapeString(blank.Voting.PublicationEndAt.Format("02.01.2006 15:04")))
		builder.WriteString("</p>")
	}

	builder.WriteString("<h2>Вопросы</h2><table><thead><tr><th>№</th><th>Вопрос</th><th>За</th><th>Против</th><th>Воздержусь</th></tr></thead><tbody>")
	for i, question := range blank.Voting.Questions {
		builder.WriteString("<tr><td>")
		builder.WriteString(fmt.Sprintf("%d", i+1))
		builder.WriteString("</td><td>")
		builder.WriteString(html.EscapeString(question.Text))
		builder.WriteString("</td><td>□</td><td>□</td><td>□</td></tr>")
	}
	builder.WriteString("</tbody></table>")

	builder.WriteString("<div class=\"sign\"><div><p class=\"muted\">Дата заполнения</p><div class=\"line\"></div></div><div><p class=\"muted\">Подпись собственника</p><div class=\"line\"></div></div></div>")
	builder.WriteString("<p class=\"muted\">Бланк сформирован: ")
	builder.WriteString(html.EscapeString(blank.GeneratedAt.Format("02.01.2006 15:04")))
	builder.WriteString("</p></body></html>")

	filename := strings.ReplaceAll(strings.ToLower(title), " ", "-")
	if filename == "" {
		filename = "voting-blank"
	}
	return builder.String(), filename + ".html", nil
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

func validateOwnerVotingIsActive(voting model.Voting, now time.Time) error {
	if voting.Status != model.StatusPublished {
		if voting.Status == model.StatusStopped {
			return errors.New("Голосование остановлено председателем.")
		}
		if voting.Status == model.StatusCompleted || voting.Status == model.StatusExpired {
			return errors.New("Голосование завершено.")
		}
		return errors.New("Опросник не опубликован.")
	}
	if voting.PublicationStatus != model.PublicationPublished {
		return errors.New("Опросник не опубликован.")
	}
	if voting.PublicationStartAt == nil || voting.PublicationEndAt == nil {
		return errors.New("Период сбора голосов не указан.")
	}
	if now.Before(*voting.PublicationStartAt) {
		return errors.New("Голосование еще не началось.")
	}
	if now.After(*voting.PublicationEndAt) {
		return errors.New("Истек крайний срок голосования.")
	}
	if voting.StoppedAt != nil {
		return errors.New("Голосование остановлено председателем.")
	}
	return nil
}

func validateOwnerVoteAnswers(voting model.Voting, requestAnswers []dto.OwnerVoteAnswerRequest) ([]model.OwnerVotingAnswer, error) {
	if len(voting.Questions) == 0 {
		return nil, errors.New("У опросника нет вопросов.")
	}
	if len(requestAnswers) != len(voting.Questions) {
		return nil, errors.New("Количество ответов должно совпадать с количеством вопросов.")
	}

	questions := make(map[string]model.Question, len(voting.Questions))
	for _, question := range voting.Questions {
		questions[question.ID] = question
	}

	seen := make(map[string]bool, len(requestAnswers))
	answers := make([]model.OwnerVotingAnswer, 0, len(requestAnswers))
	for _, item := range requestAnswers {
		questionID := strings.TrimSpace(item.QuestionID)
		answer := strings.TrimSpace(item.Answer)
		if questionID == "" {
			return nil, errors.New("question_id is required")
		}
		if seen[questionID] {
			return nil, errors.New("По каждому вопросу должен быть только один ответ.")
		}
		question, exists := questions[questionID]
		if !exists {
			return nil, errors.New("В ответах есть вопрос, которого нет в опроснике.")
		}
		if !validOwnerAnswer(answer) {
			return nil, errors.New("Допустимые значения ответа: for, against, abstain.")
		}
		seen[questionID] = true
		answers = append(answers, model.OwnerVotingAnswer{
			VotingID:     voting.ID,
			QuestionID:   question.ID,
			QuestionText: question.Text,
			Answer:       answer,
		})
	}

	for _, question := range voting.Questions {
		if !seen[question.ID] {
			return nil, fmt.Errorf("Ответьте на вопрос №%d", questionIndex(voting.Questions, question.ID)+1)
		}
	}

	return answers, nil
}

func validOwnerAnswer(answer string) bool {
	return answer == model.AnswerFor || answer == model.AnswerAgainst || answer == model.AnswerAbstain
}

func questionIndex(questions []model.Question, questionID string) int {
	for i, question := range questions {
		if question.ID == questionID {
			return i
		}
	}
	return 0
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

	category, err := normalizeVotingCategory(req.Category)
	if err != nil {
		return model.Voting{}, err
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
		Category:    category,
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
	finalDeadlineEnd := publicationDeadline(meetingAt)
	latestStartDate := dateOnly(finalDeadlineEnd).AddDate(0, 0, -minPublicationVotingDays)

	if startAt.Before(earliestStartDate) {
		return fmt.Errorf("Дата начала не может быть раньше %s.", formatPublicationDate(earliestStartDate))
	}
	if startAt.After(endOfDay(latestStartDate)) {
		return errors.New("Нельзя запланировать публикацию на эту дату: голосование должно длиться не менее 7 дней и завершиться не позднее 2 месяцев с даты собрания.")
	}
	if startAt.AddDate(0, 0, minPublicationVotingDays).After(finalDeadlineEnd) {
		return errors.New("Нельзя запланировать публикацию на эту дату: голосование должно длиться не менее 7 дней и завершиться не позднее 2 месяцев с даты собрания.")
	}

	return nil
}

func actualVotingStartAt(voting model.Voting) *time.Time {
	if voting.PublishedAt != nil {
		return voting.PublishedAt
	}
	return voting.PublicationStartAt
}

func publicationDeadline(meetingAt time.Time) time.Time {
	return endOfDay(dateOnly(meetingAt).AddDate(0, 2, 0))
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

func normalizeVotingCategory(category string) (string, error) {
	switch strings.TrimSpace(category) {
	case "", model.CategoryGeneral:
		return model.CategoryGeneral, nil
	case model.CategoryApartmentsAndCommercial:
		return model.CategoryApartmentsAndCommercial, nil
	case model.CategoryParkingAndStorerooms:
		return model.CategoryParkingAndStorerooms, nil
	default:
		return "", errors.New("invalid voting category")
	}
}

func validVotingStatus(status string) bool {
	switch status {
	case model.StatusDraft,
		model.StatusCouncilReview,
		model.StatusRevisionRequired,
		model.StatusPendingPublish,
		model.StatusPublished,
		model.StatusStopped,
		model.StatusCompleted,
		model.StatusExpired,
		"active",
		"past":
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
