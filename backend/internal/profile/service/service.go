package service

import (
	"context"
	"errors"
	"strings"

	"golosdom-backend/internal/profile/dto"
	"golosdom-backend/internal/profile/repository"
)

type Service struct {
	repo *repository.Repository
}

const maxProfilePhotoLength = 2048

func New(repo *repository.Repository) *Service {
	return &Service{repo: repo}
}

func (s *Service) GetProfile(
	ctx context.Context,
	userID string,
	activeRole string,
) (dto.ProfileResponse, error) {
	user, err := s.repo.GetUser(ctx, userID)
	if err != nil {
		return dto.ProfileResponse{}, err
	}

	roles, err := s.repo.GetRoles(ctx, userID)
	if err != nil {
		return dto.ProfileResponse{}, err
	}

	rows, err := s.repo.GetOsi(ctx, userID)
	if err != nil {
		return dto.ProfileResponse{}, err
	}

	return dto.ProfileResponse{
		User: dto.UserResponse{
			ID:       user.ID,
			FullName: user.FullName,
			Email:    user.Email,
			Phone:    user.Phone,
			Photo:    user.Photo,
		},
		ActiveRole: activeRole,
		Roles:      roles,
		Osi:        buildOsi(rows),
	}, nil
}

func (s *Service) UpdateProfile(
	ctx context.Context,
	userID string,
	req dto.UpdateProfileRequest,
	activeRole string,
) (dto.ProfileResponse, error) {
	user, err := s.repo.GetUser(ctx, userID)
	if err != nil {
		return dto.ProfileResponse{}, err
	}

	fullName := strings.TrimSpace(user.FullName)
	if req.FullName != nil {
		fullName = strings.TrimSpace(*req.FullName)
	}
	if fullName == "" {
		return dto.ProfileResponse{}, errors.New("ФИО не может быть пустым")
	}

	phone, err := normalizeOptional(req.Phone, 32, "Телефон")
	if err != nil {
		return dto.ProfileResponse{}, err
	}
	if req.Phone == nil {
		phone = user.Phone
	}

	photo, err := normalizeOptional(req.Photo, maxProfilePhotoLength, "Фото")
	if err != nil {
		return dto.ProfileResponse{}, err
	}
	if req.Photo == nil {
		photo = user.Photo
	}

	if err := s.repo.UpdateUser(ctx, userID, fullName, phone, photo); err != nil {
		return dto.ProfileResponse{}, err
	}

	return s.GetProfile(ctx, userID, activeRole)
}

func (s *Service) ChangePassword(
	ctx context.Context,
	userID string,
	req dto.ChangePasswordRequest,
) error {
	currentPassword := strings.TrimSpace(req.CurrentPassword)
	newPassword := strings.TrimSpace(req.NewPassword)
	repeatPassword := strings.TrimSpace(req.RepeatPassword)

	if currentPassword == "" || newPassword == "" {
		return errors.New("Заполните все поля смены пароля")
	}

	if len([]rune(newPassword)) < 8 {
		return errors.New("Новый пароль должен быть не короче 8 символов")
	}

	if repeatPassword != "" && newPassword != repeatPassword {
		return errors.New("Новый пароль и повтор должны совпадать")
	}

	storedPassword, err := s.repo.GetPassword(ctx, userID)
	if err != nil {
		return err
	}

	if storedPassword != currentPassword {
		return errors.New("Текущий пароль указан неверно")
	}

	return s.repo.UpdatePassword(ctx, userID, newPassword)
}

func (s *Service) UpdatePhoto(ctx context.Context, userID string, photo string) error {
	normalized := strings.TrimSpace(photo)
	if normalized == "" {
		return s.repo.UpdatePhoto(ctx, userID, nil)
	}
	if len([]rune(normalized)) > maxProfilePhotoLength {
		return errors.New("Фото слишком длинный")
	}

	return s.repo.UpdatePhoto(ctx, userID, &normalized)
}

func (s *Service) EndOtherSessions(ctx context.Context, userID string) error {
	if strings.TrimSpace(userID) == "" {
		return errors.New("Пользователь не определён")
	}

	return nil
}

func normalizeOptional(value *string, maxLength int, label string) (*string, error) {
	if value == nil {
		return nil, nil
	}

	normalized := strings.TrimSpace(*value)
	if normalized == "" {
		return nil, nil
	}
	if len([]rune(normalized)) > maxLength {
		return nil, errors.New(label + " слишком длинный")
	}

	return &normalized, nil
}

func buildOsi(rows []repository.OsiRow) []dto.OsiResponse {
	osiByID := map[string]*dto.OsiResponse{}
	order := []string{}
	buildingsByOsi := map[string]map[string]bool{}

	for _, row := range rows {
		osi, exists := osiByID[row.OsiID]
		if !exists {
			osi = &dto.OsiResponse{
				ID:        row.OsiID,
				Name:      row.OsiName,
				BIN:       row.OsiBIN,
				Address:   row.OsiAddress,
				Chairman:  buildChairman(row),
				Buildings: []dto.BuildingResponse{},
			}
			osiByID[row.OsiID] = osi
			order = append(order, row.OsiID)
			buildingsByOsi[row.OsiID] = map[string]bool{}
		}

		if row.BuildingID == nil || buildingsByOsi[row.OsiID][*row.BuildingID] {
			continue
		}

		buildingsByOsi[row.OsiID][*row.BuildingID] = true
		osi.Buildings = append(osi.Buildings, dto.BuildingResponse{
			ID:            *row.BuildingID,
			BuildingName:  row.BuildingName,
			City:          stringValue(row.BuildingCity),
			District:      row.BuildingDistrict,
			Street:        stringValue(row.BuildingStreet),
			HouseNumber:   stringValue(row.BuildingHouse),
			HouseFraction: row.BuildingHousePart,
		})
	}

	result := []dto.OsiResponse{}
	for _, id := range order {
		result = append(result, *osiByID[id])
	}

	return result
}

func buildChairman(row repository.OsiRow) *dto.ChairmanResponse {
	if row.ChairmanID == nil {
		return nil
	}

	return &dto.ChairmanResponse{
		ID:       row.ChairmanID,
		FullName: row.ChairmanFullName,
		Phone:    row.ChairmanPhone,
	}
}

func stringValue(value *string) string {
	if value == nil {
		return ""
	}

	return *value
}
