package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"golosdom-backend/internal/voting/model"
	"golosdom-backend/internal/voting/repository"
)

type Service struct {
	repo *repository.Repository
}

func New(repo *repository.Repository) *Service {
	return &Service{repo: repo}
}

func (s *Service) List() []model.Voting {
	votings, err := s.repo.List(context.Background())
	if err != nil {
		return []model.Voting{}
	}

	return votings
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

	now := time.Now().UnixNano()
	id := fmt.Sprintf("voting-%d", now)
	questionID := fmt.Sprintf("%s-question-1", id)

	voting := model.Voting{
		ID:          id,
		Title:       title,
		Description: strings.TrimSpace(description),
		Status:      "draft",
		CreatedBy:   createdBy,
		Questions: []model.Question{
			{
				ID:      questionID,
				Text:    question,
				Options: options,
			},
		},
	}

	if err := s.repo.Create(context.Background(), voting); err != nil {
		return model.Voting{}, err
	}

	return voting, nil
}
