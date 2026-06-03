package service

import (
	"context"
	"encoding/csv"
	"errors"
	"fmt"
	"html"
	"strings"
	"time"

	"golosdom-backend/internal/voting/dto"
	"golosdom-backend/internal/voting/model"
)

func (s *Service) VotingSummary(filter model.VotingSummaryFilter) (model.VotingSummaryResponse, error) {
	return s.repo.ListVotingSummary(context.Background(), filter)
}

func (s *Service) VotingSummaryDetail(votingID string) (model.VotingSummaryDetail, error) {
	return s.repo.VotingSummaryDetail(context.Background(), strings.TrimSpace(votingID))
}

func (s *Service) SendVotingReminders(votingID, actorUserID string, req dto.VotingReminderRequest) (int, error) {
	return s.repo.SendVotingReminders(context.Background(), strings.TrimSpace(votingID), strings.TrimSpace(actorUserID), req.UserIDs)
}

func (s *Service) VotingSummaryCSV(filter model.VotingSummaryFilter) (string, string, error) {
	summary, err := s.VotingSummary(filter)
	if err != nil {
		return "", "", err
	}

	var builder strings.Builder
	writer := csv.NewWriter(&builder)
	_ = writer.Write([]string{
		"Собрание",
		"Дата собрания",
		"Опросный лист",
		"Категория",
		"Статус",
		"Собственников проголосовало",
		"Голосов по имуществу",
		"Всего голосов по имуществу",
		"Участие",
		"Кворум",
		"Не хватает до кворума",
		"Решения",
		"Риск",
	})

	for _, meeting := range summary.Meetings {
		for _, voting := range meeting.Votings {
			_ = writer.Write([]string{
				meeting.Location,
				formatTime(meeting.ScheduledAt),
				voting.Title,
				categoryLabel(voting.Category),
				voting.StatusLabel,
				fmt.Sprintf("%d", voting.VotedOwnersCount),
				fmt.Sprintf("%d", voting.VotedPropertyVotes),
				fmt.Sprintf("%d", voting.TotalPropertyVotes),
				fmt.Sprintf("%.2f%%", voting.ParticipationPercent),
				boolLabel(voting.HasQuorum),
				fmt.Sprintf("%d", voting.QuorumMissingVotes),
				fmt.Sprintf("%d из %d принято", voting.AcceptedQuestions, voting.TotalQuestions),
				riskLabel(voting.RiskLevel),
			})
		}
	}
	writer.Flush()

	return builder.String(), "voting-summary.csv", writer.Error()
}

func (s *Service) VotingSummaryDetailCSV(votingID string) (string, string, error) {
	detail, err := s.VotingSummaryDetail(votingID)
	if err != nil {
		return "", "", err
	}

	var builder strings.Builder
	writer := csv.NewWriter(&builder)
	_ = writer.Write([]string{"Свод по опроснику", detail.Voting.Title})
	_ = writer.Write([]string{"Категория", categoryLabel(detail.Voting.Category)})
	_ = writer.Write([]string{"Статус", detail.Voting.StatusLabel})
	_ = writer.Write([]string{"Голосов по имуществу", fmt.Sprintf("%d / %d", detail.Voting.VotedPropertyVotes, detail.Voting.TotalPropertyVotes)})
	_ = writer.Write([]string{})
	_ = writer.Write([]string{"Вопрос", "За", "Против", "Воздержались", "Не голосовали", "Итог"})
	for _, question := range detail.Questions {
		_ = writer.Write([]string{
			question.Text,
			fmt.Sprintf("%d", question.ForVotes),
			fmt.Sprintf("%d", question.AgainstVotes),
			fmt.Sprintf("%d", question.AbstainVotes),
			fmt.Sprintf("%d", question.NotVotedVotes),
			questionResultLabel(question.Result),
		})
	}
	_ = writer.Write([]string{})
	_ = writer.Write([]string{"Собственник", "Имущество", "Голосов по имуществу", "Статус", "Дата голосования", "ЭЦП", "PDF"})
	for _, owner := range detail.Owners {
		_ = writer.Write([]string{
			owner.OwnerName,
			owner.PropertyLabel,
			fmt.Sprintf("%d", owner.PropertyVotes),
			ownerStatusLabel(owner.Status),
			formatTime(owner.VotedAt),
			signatureLabel(owner.Signature.Status),
			pdfStatusLabel(owner.PDFStatus),
		})
	}
	writer.Flush()

	return builder.String(), safeFilename(detail.Voting.Title) + "-summary.csv", writer.Error()
}

func (s *Service) VotingSummaryReportHTML(votingID string) (string, string, error) {
	detail, err := s.VotingSummaryDetail(votingID)
	if err != nil {
		return "", "", err
	}

	var builder strings.Builder
	writeDocumentStart(&builder, detail.Voting.Title)
	builder.WriteString("<h1>")
	builder.WriteString(html.EscapeString(detail.Voting.Title))
	builder.WriteString("</h1>")
	builder.WriteString("<p class=\"muted\">Итоговый отчёт по опросному листу</p>")
	builder.WriteString("<section class=\"grid\">")
	writeMetric(&builder, "Категория", categoryLabel(detail.Voting.Category), "")
	writeMetric(&builder, "Статус", detail.Voting.StatusLabel, "")
	writeMetric(&builder, "Голосов по имуществу", fmt.Sprintf("%d / %d", detail.Voting.VotedPropertyVotes, detail.Voting.TotalPropertyVotes), fmt.Sprintf("%.2f%%", detail.Voting.ParticipationPercent))
	writeMetric(&builder, "Кворум", boolLabel(detail.Voting.HasQuorum), fmt.Sprintf("Не хватает: %d", detail.Voting.QuorumMissingVotes))
	writeMetric(&builder, "Решения", fmt.Sprintf("%d из %d принято", detail.Voting.AcceptedQuestions, detail.Voting.QuestionsCount), "")
	writeMetric(&builder, "Риск", riskLabel(detail.Voting.RiskLevel), strings.Join(detail.Voting.RiskReasons, "; "))
	builder.WriteString("</section>")

	builder.WriteString("<h2>Вопросы и итоги</h2><table><thead><tr><th>№</th><th>Вопрос</th><th>За</th><th>Против</th><th>Воздержались</th><th>Не голосовали</th><th>Итог</th></tr></thead><tbody>")
	for _, question := range detail.Questions {
		builder.WriteString("<tr><td>")
		builder.WriteString(fmt.Sprintf("%d", question.Number))
		builder.WriteString("</td><td>")
		builder.WriteString(html.EscapeString(question.Text))
		builder.WriteString("</td><td>")
		builder.WriteString(fmt.Sprintf("%d", question.ForVotes))
		builder.WriteString("</td><td>")
		builder.WriteString(fmt.Sprintf("%d", question.AgainstVotes))
		builder.WriteString("</td><td>")
		builder.WriteString(fmt.Sprintf("%d", question.AbstainVotes))
		builder.WriteString("</td><td>")
		builder.WriteString(fmt.Sprintf("%d", question.NotVotedVotes))
		builder.WriteString("</td><td>")
		builder.WriteString(html.EscapeString(questionResultLabel(question.Result)))
		builder.WriteString("</td></tr>")
	}
	builder.WriteString("</tbody></table>")

	builder.WriteString("<h2>Контроль процедуры</h2><table><thead><tr><th>Признак</th><th>Статус</th><th>Комментарий</th></tr></thead><tbody>")
	for _, check := range detail.Procedure.Checks {
		builder.WriteString("<tr><td>")
		builder.WriteString(html.EscapeString(check.Title))
		builder.WriteString("</td><td>")
		builder.WriteString(html.EscapeString(procedureStatusLabel(check.Status)))
		builder.WriteString("</td><td>")
		builder.WriteString(html.EscapeString(check.Comment))
		builder.WriteString("</td></tr>")
	}
	builder.WriteString("</tbody></table>")
	writeDocumentEnd(&builder)

	return builder.String(), safeFilename(detail.Voting.Title) + "-report.html", nil
}

func (s *Service) VotingOwnerPrintHTML(votingID, ownerID string) (string, string, error) {
	detail, err := s.VotingSummaryDetail(votingID)
	if err != nil {
		return "", "", err
	}

	var owner *model.VotingOwnerSummary
	for i := range detail.Owners {
		if detail.Owners[i].OwnerID == ownerID {
			owner = &detail.Owners[i]
			break
		}
	}
	if owner == nil {
		return "", "", errors.New("Собственник не найден в списке имеющих право голосовать.")
	}
	if owner.Status != "voted" {
		return "", "", errors.New("Печать доступна только для собственника, который проголосовал.")
	}

	var builder strings.Builder
	writeDocumentStart(&builder, detail.Voting.Title)
	builder.WriteString("<h1>Опросный лист собственника</h1>")
	builder.WriteString("<p class=\"notice\">Опросный лист сформирован из электронного голосования и подписан ЭЦП собственника</p>")
	builder.WriteString("<section class=\"grid\">")
	writeMetric(&builder, "ОСИ/МЖК", htmlOrDash("МЖК"), "")
	writeMetric(&builder, "Собрание", detail.Voting.MeetingLocation, formatTime(detail.Voting.MeetingScheduledAt))
	writeMetric(&builder, "Опросник", detail.Voting.Title, categoryLabel(detail.Voting.Category))
	writeMetric(&builder, "Собственник", owner.OwnerName, "ИИН: не указан")
	writeMetric(&builder, "Имущество", owner.PropertyLabel, owner.PropertyTypes)
	writeMetric(&builder, "Лицевой счёт", emptyDash(owner.ErcAccounts), "")
	builder.WriteString("</section>")

	builder.WriteString("<h2>Ответы</h2><table><thead><tr><th>№</th><th>Вопрос</th><th>Ответ</th></tr></thead><tbody>")
	for _, question := range detail.Questions {
		builder.WriteString("<tr><td>")
		builder.WriteString(fmt.Sprintf("%d", question.Number))
		builder.WriteString("</td><td>")
		builder.WriteString(html.EscapeString(question.Text))
		builder.WriteString("</td><td>")
		builder.WriteString(html.EscapeString(answerLabel(ownerAnswer(owner.Answers, question.ID))))
		builder.WriteString("</td></tr>")
	}
	builder.WriteString("</tbody></table>")

	builder.WriteString("<h2>ЭЦП</h2><table><tbody>")
	writeKVRow(&builder, "Статус подписи", signatureLabel(owner.Signature.Status))
	writeKVRow(&builder, "Способ голосования", methodLabel(owner.Method))
	writeKVRow(&builder, "Владелец сертификата", emptyDash(owner.Signature.CertificateSubject))
	writeKVRow(&builder, "Дата подписи", formatTime(owner.Signature.SignedAt))
	writeKVRow(&builder, "Серийный номер сертификата", emptyDash(owner.Signature.CertificateSerial))
	writeKVRow(&builder, "Хэш документа", emptyDash(owner.Signature.DocumentHash))
	builder.WriteString("</tbody></table>")
	builder.WriteString("<p class=\"muted\">Дата и время голосования: ")
	builder.WriteString(html.EscapeString(formatTime(owner.VotedAt)))
	builder.WriteString("</p>")
	writeDocumentEnd(&builder)

	return builder.String(), safeFilename(detail.Voting.Title+"-"+owner.OwnerName) + ".html", nil
}

func writeDocumentStart(builder *strings.Builder, title string) {
	builder.WriteString("<!doctype html><html><head><meta charset=\"utf-8\"><title>")
	builder.WriteString(html.EscapeString(title))
	builder.WriteString("</title><style>body{font-family:Arial,sans-serif;line-height:1.45;color:#0f172a;padding:32px;}h1{font-size:24px;margin:0 0 8px;}h2{font-size:18px;margin:28px 0 10px}.muted{color:#64748b}.notice{border:1px solid #bfdbfe;background:#eff6ff;padding:12px;border-radius:8px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:20px 0}.metric{border:1px solid #e2e8f0;border-radius:8px;padding:12px}.label{font-size:12px;color:#64748b;text-transform:uppercase}.value{font-size:16px;font-weight:700;margin-top:4px}.hint{font-size:12px;color:#475569;margin-top:4px}table{width:100%;border-collapse:collapse;margin-top:12px}td,th{border:1px solid #cbd5e1;padding:9px;text-align:left;vertical-align:top}th{background:#f8fafc}@media print{body{padding:18px}.grid{grid-template-columns:repeat(2,minmax(0,1fr))}}</style></head><body>")
}

func writeDocumentEnd(builder *strings.Builder) {
	builder.WriteString("<p class=\"muted\">Сформировано: ")
	builder.WriteString(html.EscapeString(time.Now().Format("02.01.2006 15:04")))
	builder.WriteString("</p></body></html>")
}

func writeMetric(builder *strings.Builder, label, value, hint string) {
	builder.WriteString("<div class=\"metric\"><div class=\"label\">")
	builder.WriteString(html.EscapeString(label))
	builder.WriteString("</div><div class=\"value\">")
	builder.WriteString(html.EscapeString(emptyDash(value)))
	builder.WriteString("</div>")
	if strings.TrimSpace(hint) != "" {
		builder.WriteString("<div class=\"hint\">")
		builder.WriteString(html.EscapeString(hint))
		builder.WriteString("</div>")
	}
	builder.WriteString("</div>")
}

func writeKVRow(builder *strings.Builder, key, value string) {
	builder.WriteString("<tr><th>")
	builder.WriteString(html.EscapeString(key))
	builder.WriteString("</th><td>")
	builder.WriteString(html.EscapeString(emptyDash(value)))
	builder.WriteString("</td></tr>")
}

func ownerAnswer(answers []model.VotingOwnerAnswer, questionID string) string {
	for _, answer := range answers {
		if answer.QuestionID == questionID {
			return answer.Answer
		}
	}
	return ""
}

func categoryLabel(value string) string {
	switch value {
	case model.CategoryApartmentsAndCommercial:
		return "Квартиры и НП"
	case model.CategoryParkingAndStorerooms:
		return "Кладовые и паркоместа"
	default:
		return "Общий"
	}
}

func riskLabel(value string) string {
	switch value {
	case "high":
		return "Высокий"
	case "medium":
		return "Средний"
	default:
		return "Низкий"
	}
}

func questionResultLabel(value string) string {
	switch value {
	case "accepted":
		return "Решение принято"
	case "rejected":
		return "Решение не принято"
	case "not_enough_votes":
		return "Недостаточно голосов"
	default:
		return "Требует проверки"
	}
}

func ownerStatusLabel(value string) string {
	if value == "voted" {
		return "Проголосовал"
	}
	return "Не голосовал"
}

func answerLabel(value string) string {
	switch value {
	case model.AnswerFor:
		return "За"
	case model.AnswerAgainst:
		return "Против"
	case model.AnswerAbstain:
		return "Воздержусь"
	default:
		return "Не голосовал"
	}
}

func signatureLabel(value string) string {
	switch value {
	case "signed":
		return "Проверена"
	case "error":
		return "Ошибка"
	case "not_required":
		return "Не требуется"
	default:
		return "Нет"
	}
}

func pdfStatusLabel(value string) string {
	if value == "formed" {
		return "Сформирован"
	}
	return "Не сформирован"
}

func methodLabel(value string) string {
	switch value {
	case model.SignatureMockMGov:
		return "Онлайн, mGov"
	case model.SignatureMockECP:
		return "Онлайн, ЭЦП"
	default:
		return "Онлайн"
	}
}

func procedureStatusLabel(value string) string {
	if value == "ok" {
		return "OK"
	}
	return "Требует проверки"
}

func boolLabel(value bool) string {
	if value {
		return "Есть"
	}
	return "Нет"
}

func formatTime(value *time.Time) string {
	if value == nil {
		return ""
	}
	return value.Format("02.01.2006 15:04")
}

func safeFilename(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	if value == "" {
		return "voting-summary"
	}
	replacer := strings.NewReplacer(" ", "-", "/", "-", "\\", "-", "\"", "", "'", "", ":", "-")
	return replacer.Replace(value)
}

func emptyDash(value string) string {
	if strings.TrimSpace(value) == "" {
		return "Не указан"
	}
	return value
}

func htmlOrDash(value string) string {
	return emptyDash(value)
}
