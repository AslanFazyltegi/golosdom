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

	if strings.Contains(email, "chairman") {
		user.Roles = append(user.Roles, "CHAIRMAN")
	}

	err := s.repo.Create(context.Background(), user)
	if err != nil {
		return model.User{}, err
	}

	return user, nil
}

func (s *Service) Login(email, password string) (model.User, error) {
	user, err := s.repo.GetByEmail(context.Background(), email)
	if err != nil {
		return model.User{}, errors.New("invalid credentials")
	}

	if user.Password != password {
		return model.User{}, errors.New("invalid credentials")
	}

	user.Roles = resolveRoles(user.Email)

	return user, nil
}

func (s *Service) GetByID(id string) (model.User, error) {
	user, err := s.repo.GetByID(context.Background(), id)
	if err != nil {
		return model.User{}, errors.New("user not found")
	}

	user.Roles = resolveRoles(user.Email)

	return user, nil
}

func resolveRoles(email string) []string {
	roles := []string{"OWNER"}

	if strings.Contains(email, "chairman") {
		roles = append(roles, "CHAIRMAN")
	}

	return roles
}
