package service

import (
	"errors"
	"fmt"
	"strings"
	"sync"

	"golosdom-backend/internal/voting/model"
)

type Service struct {
	mu      sync.RWMutex
	votings map[string]model.Voting
	counter int
}

func New() *Service {
	s := &Service{
		votings: make(map[string]model.Voting),
	}

	s.votings["voting-1"] = model.Voting{
		ID:          "voting-1",
		Title:       "Утверждение сметы ОСИ на 2026 год",
		Description: "Голосование по утверждению годовой сметы расходов.",
		Status:      "active",
		CreatedBy:   "system",
		Questions: []model.Question{
			{
				ID:      "question-1",
				Text:    "Вы согласны утвердить смету?",
				Options: []string{"Да", "Нет", "Воздержался"},
			},
		},
	}

	return s
}

func (s *Service) List() []model.Voting {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make([]model.Voting, 0, len(s.votings))
	for _, voting := range s.votings {
		result = append(result, voting)
	}

	return result
}

func (s *Service) Create(createdBy, title, description, question string, options []string) (model.Voting, error) {
	title = strings.TrimSpace(title)
	question = strings.TrimSpace(question)

	if title == "" {
		return model.Voting{}, errors.New("title is required")
	}

	if question == "" {
		return model.Voting{}, errors.New("question is required")
	}

	if len(options) < 2 {
		return model.Voting{}, errors.New("at least 2 options are required")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	s.counter++
	id := fmt.Sprintf("voting-%d", s.counter+1)

	voting := model.Voting{
		ID:          id,
		Title:       title,
		Description: strings.TrimSpace(description),
		Status:      "draft",
		CreatedBy:   createdBy,
		Questions: []model.Question{
			{
				ID:      fmt.Sprintf("%s-question-1", id),
				Text:    question,
				Options: options,
			},
		},
	}

	s.votings[id] = voting

	return voting, nil
}
