package service

import (
	"context"

	"golosdom-backend/internal/owners/dto"
	"golosdom-backend/internal/owners/repository"
)

type Service struct {
	repo *repository.Repository
}

func New(repo *repository.Repository) *Service {
	return &Service{repo: repo}
}

func (s *Service) GetOwners(ctx context.Context) ([]dto.OwnerResponse, error) {
	return s.repo.GetOwners(ctx)
}
