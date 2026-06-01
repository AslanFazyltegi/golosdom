package service

import (
	"context"
	"strings"

	"golosdom-backend/internal/navigation/dto"
	"golosdom-backend/internal/navigation/model"
	"golosdom-backend/internal/navigation/repository"
)

type Service struct {
	repo *repository.Repository
}

func New(repo *repository.Repository) *Service {
	return &Service{repo: repo}
}

func (s *Service) GetMenuByRole(roleCode string) ([]dto.MenuItemResponse, error) {
	roleCode = strings.TrimSpace(strings.ToUpper(roleCode))

	items, err := s.repo.GetMenuByRole(context.Background(), roleCode)
	if err != nil {
		return nil, err
	}

	return buildTree(items), nil
}

func buildTree(items []model.NavigationItem) []dto.MenuItemResponse {
	byID := map[string]*dto.MenuItemResponse{}
	parentByID := map[string]*string{}
	order := []string{}

	for _, item := range items {
		byID[item.ID] = &dto.MenuItemResponse{
			Code:      item.Code,
			Title:     item.Title,
			Icon:      item.Icon,
			Component: item.Component,
			CanView:   item.CanView,
			CanCreate: item.CanCreate,
			CanUpdate: item.CanUpdate,
			CanDelete: item.CanDelete,
			IsDefault: item.IsDefault,
			Children:  []dto.MenuItemResponse{},
		}

		parentByID[item.ID] = item.ParentID
		order = append(order, item.ID)
	}

	for _, id := range order {
		parentID := parentByID[id]
		if parentID == nil {
			continue
		}

		parent, exists := byID[*parentID]
		if exists {
			parent.Children = append(parent.Children, *byID[id])
		}
	}

	tree := []dto.MenuItemResponse{}

	for _, id := range order {
		parentID := parentByID[id]
		if parentID == nil || byID[*parentID] == nil {
			tree = append(tree, *byID[id])
		}
	}

	return tree
}
