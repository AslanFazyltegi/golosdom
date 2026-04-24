package service

import (
	"errors"
	"strings"
	"sync"

	"golosdom-backend/internal/auth/model"
)

type Service struct {
	mu      sync.RWMutex
	users   map[string]model.User
	byEmail map[string]string
}

func New() *Service {
	return &Service{
		users:   make(map[string]model.User),
		byEmail: make(map[string]string),
	}
}

func (s *Service) Register(email, password, fullName string) (model.User, error) {
	email = strings.TrimSpace(strings.ToLower(email))
	fullName = strings.TrimSpace(fullName)

	if email == "" || password == "" || fullName == "" {
		return model.User{}, errors.New("email, password and full_name are required")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if _, exists := s.byEmail[email]; exists {
		return model.User{}, errors.New("user already exists")
	}

	id := email

	roles := []string{"OWNER"}

	// временное правило для теста:
	// если email содержит chairman, добавляем роль председателя
	if strings.Contains(email, "chairman") {
		roles = append(roles, "CHAIRMAN")
	}

	user := model.User{
		ID:       id,
		Email:    email,
		Password: password,
		FullName: fullName,
		Roles:    roles,
	}

	s.users[id] = user
	s.byEmail[email] = id

	return user, nil
}

func (s *Service) Login(email, password string) (model.User, error) {
	email = strings.TrimSpace(strings.ToLower(email))

	s.mu.RLock()
	defer s.mu.RUnlock()

	id, exists := s.byEmail[email]
	if !exists {
		return model.User{}, errors.New("invalid credentials")
	}

	user := s.users[id]
	if user.Password != password {
		return model.User{}, errors.New("invalid credentials")
	}

	return user, nil
}

func (s *Service) GetByID(id string) (model.User, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	user, exists := s.users[id]
	if !exists {
		return model.User{}, errors.New("user not found")
	}

	return user, nil
}
