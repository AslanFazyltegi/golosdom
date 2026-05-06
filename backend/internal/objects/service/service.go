package service

import (
	"context"
	"strings"

	"golosdom-backend/internal/objects/dto"
	"golosdom-backend/internal/objects/repository"
)

type Service struct {
	repo *repository.Repository
}

func New(
	repo *repository.Repository,
) *Service {

	return &Service{
		repo: repo,
	}
}

func (s *Service) GetObjects(
	role string,
	userID string,
) (any, error) {

	role = strings.ToUpper(role)

	if role == "CHAIRMAN" {

		building, err := s.repo.GetBuilding(
			context.Background(),
		)

		if err != nil {
			return nil, err
		}

		return dto.BuildingResponse{
			Type: "building",

			City:         building.City,
			District:     building.District,
			BuildingName: building.BuildingName,
			Street:       building.Street,
			HouseNumber:  building.HouseNumber,

			FloorsCount:    building.FloorsCount,
			EntrancesCount: building.EntrancesCount,

			ApartmentsCount: building.ApartmentsCount,
			CommercialCount: building.CommercialCount,
			StorageCount:    building.StorageCount,
			ParkingCount:    building.ParkingCount,
		}, nil
	}

	properties, err := s.repo.GetUserProperties(
		context.Background(),
		userID,
	)

	if err != nil {
		return nil, err
	}

	result := []dto.PropertyResponse{}

	for _, p := range properties {

		result = append(
			result,
			dto.PropertyResponse{
				Type: "property",

				PropertyType: p.Type,
				Number:       p.Number,

				Area: p.Area,

				Status: p.Status,
			},
		)
	}

	return result, nil
}
