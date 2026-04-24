package service

import (
	"context"
	"errors"
	"strings"

	"golosdom-backend/internal/auth/model"
	"golosdom-backend/internal/auth/repository"
)

type Service struct {
	repo *repository.Repository
}

func New(repo *repository.Repository) *Service {
	return &Service{repo: repo}
}

func (s *Service) Register(email, password, fullName string) (model.User, error) {
	email = strings.TrimSpace(strings.ToLower(email))
	fullName = strings.TrimSpace(fullName)

	if email == "" || password == "" || fullName == "" {
		return model.User{}, errors.New("email, password and full_name are required")
	}

	user := model.User{
		ID:       email,
		Email:    email,
		Password: password,
		FullName: fullName,
		Roles:    []string{"OWNER"},
	}

	if err := s.repo.Create(context.Background(), user); err != nil {
		return model.User{}, err
	}

	if err := s.repo.AssignRole(context.Background(), user.ID, "OWNER"); err != nil {
		return model.User{}, err
	}

	user.Roles = []string{"OWNER"}

	return user, nil
}

func (s *Service) Login(email, password string) (model.User, error) {
	email = strings.TrimSpace(strings.ToLower(email))

	user, err := s.repo.GetByEmail(context.Background(), email)
	if err != nil {
		return model.User{}, errors.New("invalid credentials")
	}

	if user.Password != password {
		return model.User{}, errors.New("invalid credentials")
	}

	roles, err := s.repo.GetUserRoles(context.Background(), user.ID)
	if err != nil {
		return model.User{}, err
	}

	user.Roles = roles

	return user, nil
}

func (s *Service) GetByID(id string) (model.User, error) {
	user, err := s.repo.GetByID(context.Background(), id)
	if err != nil {
		return model.User{}, errors.New("user not found")
	}

	roles, err := s.repo.GetUserRoles(context.Background(), user.ID)
	if err != nil {
		return model.User{}, err
	}

	user.Roles = roles

	return user, nil
}
