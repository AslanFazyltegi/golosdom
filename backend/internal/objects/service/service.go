package service

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"

	"golosdom-backend/internal/objects/dto"
	"golosdom-backend/internal/objects/repository"
)

type Service struct {
	repo *repository.Repository
}

var ErrForbidden = errors.New("forbidden")

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

	role = strings.ToUpper(strings.TrimSpace(role))

	if isBuildingRole(role) {

		building, err := s.repo.GetBuilding(
			context.Background(),
		)

		if err != nil {
			return nil, err
		}

		return dto.BuildingResponse{
			Type: "building",

			City:          building.City,
			District:      building.District,
			BuildingName:  building.BuildingName,
			Street:        building.Street,
			HouseNumber:   building.HouseNumber,
			HouseFraction: building.HouseFraction,

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

func (s *Service) GetMyProperties(userID string) (dto.MyPropertiesResponse, error) {
	properties, err := s.repo.GetMyProperties(context.Background(), userID)
	if err != nil {
		return dto.MyPropertiesResponse{}, err
	}

	activeVotings, err := s.repo.CountActiveVotingsForOwner(context.Background(), userID)
	if err != nil {
		activeVotings = 0
	}

	result := dto.MyPropertiesResponse{
		Summary: dto.MyPropertiesSummary{
			TotalObjects:  len(properties),
			ActiveVotings: activeVotings,
		},
		Properties: []dto.MyProperty{},
	}

	ercAccounts := map[string]bool{}
	for _, item := range properties {
		if item.Status == "active" {
			result.Summary.ActiveObjects++
		}
		if item.ErcAccount.Valid && strings.TrimSpace(item.ErcAccount.String) != "" {
			ercAccounts[strings.TrimSpace(item.ErcAccount.String)] = true
		}

		typeLabel := propertyTypeLabel(item.Type)
		payerUpdatedAt := timePtrRFC3339(item.PayerUpdatedAt)
		buildingName := valueOr(item.BuildingName, "ЖК")
		building := dto.MyPropertyBuilding{
			ID:            item.BuildingID,
			Name:          buildingName,
			City:          item.City,
			District:      stringPtr(item.District),
			Street:        item.Street,
			HouseNumber:   item.HouseNumber,
			HouseFraction: stringPtr(item.HouseFraction),
			FullAddress:   fullAddress(item),
		}

		result.Properties = append(result.Properties, dto.MyProperty{
			ID:               item.ID,
			Type:             item.Type,
			TypeLabel:        typeLabel,
			Number:           item.Number,
			Title:            typeLabel + " №" + item.Number,
			Status:           item.Status,
			StatusLabel:      propertyStatusLabel(item.Status),
			Area:             floatPtr(item.Area),
			Floor:            intPtr(item.Floor),
			Entrance:         intPtr(item.Entrance),
			Share:            floatPtr(item.Share),
			ErcAccount:       stringPtr(item.ErcAccount),
			PayerName:        stringPtr(item.PayerName),
			PayerStatus:      item.PayerStatus,
			PayerStatusLabel: payerStatusLabel(item.PayerStatus),
			PayerUpdatedAt:   payerUpdatedAt,
			ImageURL:         stringPtr(item.ImageURL),
			Building:         building,
			VotingParticipation: dto.MyPropertyVotingCategories{
				General:             true,
				ApartmentCommercial: participatesInApartmentCommercial(item.Type),
				StorageParking:      participatesInStorageParking(item.Type),
			},
		})
	}
	result.Summary.ErcAccounts = len(ercAccounts)

	return result, nil
}

func (s *Service) CreatePropertyUpdateRequest(propertyID string, userID string, req dto.CreatePropertyUpdateRequest) (dto.PropertyUpdateRequestResponse, error) {
	requestType := strings.TrimSpace(req.RequestType)
	if requestType == "" {
		return dto.PropertyUpdateRequestResponse{}, errors.New("request type is required")
	}

	id, createdAt, err := s.repo.CreatePropertyUpdateRequest(context.Background(), repository.CreatePropertyUpdateRequestData{
		PropertyID:  propertyID,
		UserID:      userID,
		RequestType: requestType,
		NewValue:    trimStringPtr(req.NewValue),
		Comment:     trimStringPtr(req.Comment),
	})
	if err != nil {
		return dto.PropertyUpdateRequestResponse{}, err
	}

	return dto.PropertyUpdateRequestResponse{
		ID:        id,
		Status:    "pending",
		CreatedAt: createdAt.Format(time.RFC3339),
	}, nil
}

func (s *Service) GetDashboard() (dto.DashboardResponse, error) {
	building, stats, distribution, actions, err := s.repo.GetDashboard(context.Background())
	if err != nil {
		return dto.DashboardResponse{}, err
	}

	return dto.DashboardResponse{
		Building:         mapBuilding(building),
		Statistics:       mapStatistics(stats),
		TypeDistribution: mapTypeDistribution(distribution),
		RecentActions:    mapActivityLogs(actions),
	}, nil
}

func (s *Service) GetProperties() ([]dto.PropertyDashboardItem, error) {
	building, err := s.repo.GetBuilding(context.Background())
	if err != nil {
		return nil, err
	}

	properties, err := s.repo.GetBuildingProperties(context.Background(), building.ID)
	if err != nil {
		return nil, err
	}

	result := []dto.PropertyDashboardItem{}
	for _, item := range properties {
		var owner *dto.OwnerInfo
		if item.OwnerID.Valid {
			owner = &dto.OwnerInfo{
				ID:    item.OwnerID.String,
				Name:  displayName(item.OwnerName, item.OwnerEmail),
				Email: item.OwnerEmail.String,
				Phone: stringPtr(item.OwnerPhone),
			}
		}

		result = append(result, dto.PropertyDashboardItem{
			ID:         item.ID,
			Type:       item.Type,
			Number:     item.Number,
			Entrance:   intPtr(item.Entrance),
			Floor:      intPtr(item.Floor),
			Area:       floatPtr(item.Area),
			Status:     item.Status,
			ErcAccount: stringPtr(item.ErcAccount),
			Owner:      owner,
		})
	}

	return result, nil
}

func (s *Service) GetOwners() ([]dto.OwnerDashboardItem, error) {
	building, err := s.repo.GetBuilding(context.Background())
	if err != nil {
		return nil, err
	}

	owners, err := s.repo.GetBuildingOwners(context.Background(), building.ID)
	if err != nil {
		return nil, err
	}

	result := []dto.OwnerDashboardItem{}
	for _, owner := range owners {
		properties := []dto.OwnerPropertyDashboard{}
		for _, property := range owner.Properties {
			properties = append(properties, dto.OwnerPropertyDashboard{
				ID:     property.ID,
				Type:   property.Type,
				Number: property.Number,
			})
		}

		result = append(result, dto.OwnerDashboardItem{
			ID:              owner.ID,
			Name:            owner.Name,
			Email:           owner.Email,
			Phone:           stringPtr(owner.Phone),
			PropertiesCount: owner.PropertiesCount,
			Properties:      properties,
		})
	}

	return result, nil
}

func (s *Service) GetUsers() ([]dto.UserOption, error) {
	users, err := s.repo.GetUsers(context.Background())
	if err != nil {
		return nil, err
	}

	result := []dto.UserOption{}
	for _, user := range users {
		result = append(result, dto.UserOption{
			ID:    user.ID,
			Name:  user.Name,
			Email: user.Email,
			Phone: stringPtr(user.Phone),
		})
	}

	return result, nil
}

func (s *Service) GetPropertyUpdateRequests(roles string) (dto.PropertyUpdateRequestsResponse, error) {
	if !isChairman(roles) {
		return dto.PropertyUpdateRequestsResponse{}, ErrForbidden
	}

	building, err := s.repo.GetBuilding(context.Background())
	if err != nil {
		return dto.PropertyUpdateRequestsResponse{}, err
	}

	rows, pendingCount, err := s.repo.GetPropertyUpdateRequests(context.Background(), building.ID)
	if err != nil {
		return dto.PropertyUpdateRequestsResponse{}, err
	}

	result := dto.PropertyUpdateRequestsResponse{
		PendingCount: pendingCount,
		Requests:     []dto.PropertyUpdateRequest{},
	}
	for _, row := range rows {
		result.Requests = append(result.Requests, dto.PropertyUpdateRequest{
			ID:             row.ID,
			PropertyID:     row.PropertyID,
			PropertyType:   row.PropertyType,
			PropertyNumber: row.PropertyNumber,
			UserName:       row.UserName,
			UserPhone:      stringPtr(row.UserPhone),
			RequestType:    row.RequestType,
			NewValue:       stringPtr(row.NewValue),
			Comment:        stringPtr(row.Comment),
			Status:         row.Status,
			ReadAt:         timePtrRFC3339(row.ReadAt),
			ProcessedAt:    timePtrRFC3339(row.ProcessedAt),
			ProcessedBy:    stringPtr(row.ProcessedBy),
			CreatedAt:      row.CreatedAt.Format(time.RFC3339),
		})
	}

	return result, nil
}

func (s *Service) ProcessPropertyUpdateRequest(requestID string, userID string, roles string) error {
	if !isChairman(roles) {
		return ErrForbidden
	}
	requestID = strings.TrimSpace(requestID)
	if requestID == "" {
		return sql.ErrNoRows
	}

	building, err := s.repo.GetBuilding(context.Background())
	if err != nil {
		return err
	}

	return s.repo.ProcessPropertyUpdateRequest(context.Background(), building.ID, requestID, userID)
}

func (s *Service) UpdateBuilding(req dto.UpdateBuildingRequest, userID string, roles string) (dto.Building, error) {
	if !canEdit(roles) {
		return dto.Building{}, ErrForbidden
	}

	building, err := s.repo.GetBuilding(context.Background())
	if err != nil {
		return dto.Building{}, err
	}

	data := repository.BuildingUpdateData{
		BuildingName:         stringOr(req.BuildingName, building.BuildingName),
		City:                 stringOr(req.City, &building.City),
		District:             stringOr(req.District, building.District),
		Street:               stringOr(req.Street, &building.Street),
		HouseNumber:          stringOr(req.HouseNumber, &building.HouseNumber),
		HouseFraction:        stringOr(req.HouseFraction, building.HouseFraction),
		FloorsCount:          intOr(req.FloorsCount, building.FloorsCount),
		EntrancesCount:       intOr(req.EntrancesCount, building.EntrancesCount),
		ApartmentsCount:      intOr(req.ApartmentsCount, building.ApartmentsCount),
		CommercialUnitsCount: intOr(req.CommercialUnitsCount, building.CommercialCount),
		StoreroomsCount:      intOr(req.StoreroomsCount, building.StorageCount),
		ParkingSpacesCount:   intOr(req.ParkingSpacesCount, building.ParkingCount),
	}

	updated, err := s.repo.UpdateBuilding(context.Background(), building.ID, data)
	if err != nil {
		return dto.Building{}, err
	}

	s.repo.LogAction(context.Background(), building.ID, "building", building.ID, "building_updated", "Изменены данные МЖК", userID)

	return mapBuilding(updated), nil
}

func (s *Service) UpdateProperty(propertyID string, req dto.UpdatePropertyRequest, userID string, roles string) error {
	if !canEdit(roles) {
		return ErrForbidden
	}

	building, err := s.repo.GetBuilding(context.Background())
	if err != nil {
		return err
	}

	data := repository.PropertyUpdateData{
		Type:     req.Type,
		Number:   req.Number,
		Entrance: req.Entrance,
		Floor:    req.Floor,
		Area:     req.Area,
		UserID:   req.UserID,
	}

	if err := s.repo.UpdateProperty(context.Background(), building.ID, propertyID, data); err != nil {
		return err
	}

	description := "Изменены данные имущества"
	if req.UserID != nil {
		description = "Изменен собственник имущества"
	}
	s.repo.LogAction(context.Background(), building.ID, "property", propertyID, "property_updated", description, userID)

	return nil
}

func isBuildingRole(role string) bool {
	switch role {
	case "CHAIRMAN", "COUNCIL_MEMBER", "AUDITOR", "SYSTEM_ADMIN":
		return true
	default:
		return false
	}
}

func canEdit(roles string) bool {
	for _, role := range strings.Split(roles, ",") {
		switch strings.ToUpper(strings.TrimSpace(role)) {
		case "CHAIRMAN", "ADMIN":
			return true
		}
	}

	return false
}

func isChairman(roles string) bool {
	for _, role := range strings.Split(roles, ",") {
		if strings.ToUpper(strings.TrimSpace(role)) == "CHAIRMAN" {
			return true
		}
	}

	return false
}

func mapBuilding(building repository.BuildingData) dto.Building {
	return dto.Building{
		ID:              building.ID,
		City:            building.City,
		District:        building.District,
		BuildingName:    building.BuildingName,
		Street:          building.Street,
		HouseNumber:     building.HouseNumber,
		HouseFraction:   building.HouseFraction,
		FloorsCount:     building.FloorsCount,
		EntrancesCount:  building.EntrancesCount,
		ApartmentsCount: building.ApartmentsCount,
		CommercialCount: building.CommercialCount,
		StorageCount:    building.StorageCount,
		ParkingCount:    building.ParkingCount,
	}
}

func mapStatistics(stats repository.BuildingStatisticsData) dto.BuildingStatistics {
	return dto.BuildingStatistics{
		Apartments:      stats.Apartments,
		Commercial:      stats.Commercial,
		Storerooms:      stats.Storerooms,
		Parking:         stats.Parking,
		Entrances:       stats.Entrances,
		Floors:          stats.Floors,
		TotalProperties: stats.TotalProperties,
		WithOwner:       stats.WithOwner,
		WithoutOwner:    stats.WithoutOwner,
		UniqueOwners:    stats.UniqueOwners,
	}
}

func mapTypeDistribution(items []repository.TypeDistributionData) []dto.TypeDistribution {
	result := []dto.TypeDistribution{}
	for _, item := range items {
		result = append(result, dto.TypeDistribution{
			Type:  item.Type,
			Count: item.Count,
		})
	}

	return result
}

func mapActivityLogs(items []repository.ActivityLogData) []dto.ActivityLog {
	result := []dto.ActivityLog{}
	for _, item := range items {
		result = append(result, dto.ActivityLog{
			ID:          item.ID,
			Action:      item.Action,
			Description: item.Description,
			CreatedBy:   valueOrEmpty(item.CreatedBy),
			CreatedAt:   item.CreatedAt.Format(time.RFC3339),
		})
	}

	return result
}

func stringPtr(value sql.NullString) *string {
	if !value.Valid {
		return nil
	}

	return &value.String
}

func intPtr(value sql.NullInt64) *int {
	if !value.Valid {
		return nil
	}

	result := int(value.Int64)
	return &result
}

func floatPtr(value sql.NullFloat64) *float64 {
	if !value.Valid {
		return nil
	}

	return &value.Float64
}

func displayName(name sql.NullString, email sql.NullString) string {
	if name.Valid && strings.TrimSpace(name.String) != "" {
		return name.String
	}
	if email.Valid {
		return email.String
	}

	return ""
}

func valueOrEmpty(value sql.NullString) string {
	if value.Valid {
		return value.String
	}

	return ""
}

func stringOr(incoming *string, current *string) *string {
	if incoming != nil {
		return incoming
	}

	return current
}

func intOr(incoming *int, current *int) *int {
	if incoming != nil {
		return incoming
	}

	return current
}

func propertyTypeLabel(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "apartment":
		return "Квартира"
	case "commercial", "commercial_room", "commercial_unit":
		return "Нежилое помещение"
	case "parking", "parking_space":
		return "Паркоместо"
	case "storeroom", "storage":
		return "Кладовая"
	default:
		return value
	}
}

func propertyStatusLabel(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "active":
		return "Активный"
	case "inactive":
		return "Неактивный"
	case "disputed":
		return "Спорный"
	default:
		return value
	}
}

func payerStatusLabel(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "confirmed":
		return "Подтверждён"
	case "pending":
		return "На переоформлении"
	case "not_confirmed":
		return "Не подтверждён"
	case "rejected":
		return "Отклонён"
	default:
		return value
	}
}

func participatesInApartmentCommercial(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "apartment", "commercial", "commercial_room", "commercial_unit":
		return true
	default:
		return false
	}
}

func participatesInStorageParking(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "parking", "parking_space", "storeroom", "storage":
		return true
	default:
		return false
	}
}

func fullAddress(item repository.MyPropertyData) string {
	parts := []string{}
	if strings.TrimSpace(item.City) != "" {
		parts = append(parts, item.City)
	}
	if item.District.Valid && strings.TrimSpace(item.District.String) != "" {
		parts = append(parts, item.District.String)
	}
	if item.BuildingName.Valid && strings.TrimSpace(item.BuildingName.String) != "" {
		parts = append(parts, item.BuildingName.String)
	}
	if strings.TrimSpace(item.Street) != "" {
		parts = append(parts, item.Street)
	}
	house := item.HouseNumber
	if item.HouseFraction.Valid && strings.TrimSpace(item.HouseFraction.String) != "" {
		house += "/" + item.HouseFraction.String
	}
	if strings.TrimSpace(house) != "" {
		parts = append(parts, house)
	}

	return strings.Join(parts, ", ")
}

func valueOr(value sql.NullString, fallback string) string {
	if value.Valid && strings.TrimSpace(value.String) != "" {
		return value.String
	}

	return fallback
}

func timePtrRFC3339(value sql.NullTime) *string {
	if !value.Valid {
		return nil
	}

	result := value.Time.Format(time.RFC3339)
	return &result
}

func trimStringPtr(value *string) *string {
	if value == nil {
		return nil
	}

	result := strings.TrimSpace(*value)
	if result == "" {
		return nil
	}

	return &result
}
