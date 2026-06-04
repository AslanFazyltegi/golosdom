package audience

import "fmt"

const CouncilMemberRole = "COUNCIL_MEMBER"

func PublishedNewsPredicate(alias string) string {
	return fmt.Sprintf("%s.status = 'published' AND %s.is_visible = true AND %s.deleted_at IS NULL AND %s.hidden_at IS NULL", alias, alias, alias, alias)
}

func PublishedAnnouncementPredicate(alias string) string {
	return fmt.Sprintf("%s.status = 'published' AND %s.is_visible = true AND %s.deleted_at IS NULL AND %s.hidden_at IS NULL AND (%s.actual_until IS NULL OR %s.actual_until >= now())", alias, alias, alias, alias, alias, alias)
}

func VisibleNotificationPredicate(alias string) string {
	return fmt.Sprintf("%s.status IN ('sent', 'delivered', 'partially_delivered', 'partially_read', 'read') AND %s.deleted_at IS NULL AND %s.hidden_at IS NULL", alias, alias, alias)
}

func InfocenterItemPredicate(alias string, userExpr string) string {
	buildingExpr := fmt.Sprintf("NULLIF(%s.audience_filter->>'building_id', '')", alias)
	return fmt.Sprintf(`(
		(%[1]s.audience_type = 'all_owners' AND %[2]s)
		OR (%[1]s.audience_type = 'apartments_commercial' AND %[3]s)
		OR (%[1]s.audience_type = 'storage_parking' AND %[4]s)
		OR (%[1]s.audience_type = 'council_members' AND %[5]s)
	)`,
		alias,
		UserHasAnyPropertyOptionalBuildingPredicate(userExpr, buildingExpr),
		UserHasPropertyTypeOptionalBuildingPredicate(userExpr, buildingExpr, "'apartment', 'commercial_room'"),
		UserHasPropertyTypeOptionalBuildingPredicate(userExpr, buildingExpr, "'storage', 'parking'"),
		UserHasRolePredicate(userExpr, "'"+CouncilMemberRole+"'"),
	)
}

func CommunicationTargetPredicate(targetAlias string, buildingExpr string, userExpr string) string {
	return fmt.Sprintf(`(
		(%[1]s.target_type = 'all' AND %[2]s)
		OR (%[1]s.target_type = 'user' AND %[1]s.target_value = %[4]s)
		OR (%[1]s.target_type = 'role' AND %[3]s)
		OR (%[1]s.target_type = 'property_type' AND %[5]s)
	)`,
		targetAlias,
		UserHasAnyPropertyPredicate(userExpr, buildingExpr),
		UserHasRolePredicate(userExpr, targetAlias+".target_value"),
		userExpr,
		UserHasPropertyTypePredicate(userExpr, buildingExpr, targetAlias+".target_value"),
	)
}

func UserHasAnyPropertyPredicate(userExpr string, buildingExpr string) string {
	buildingClause := ""
	if buildingExpr != "" {
		buildingClause = fmt.Sprintf("AND p_audience.building_id = %s", buildingExpr)
	}
	return fmt.Sprintf(`EXISTS (
		SELECT 1
		FROM property_owners po_audience
		JOIN property p_audience ON p_audience.id = po_audience.property_id
		WHERE po_audience.user_id = %[1]s
			AND po_audience.status = 'active'
			%[2]s
	)`, userExpr, buildingClause)
}

func UserHasPropertyTypePredicate(userExpr string, buildingExpr string, typeExpr string) string {
	buildingClause := ""
	if buildingExpr != "" {
		buildingClause = fmt.Sprintf("AND p_audience_type.building_id = %s", buildingExpr)
	}
	return fmt.Sprintf(`EXISTS (
		SELECT 1
		FROM property_owners po_audience_type
		JOIN property p_audience_type ON p_audience_type.id = po_audience_type.property_id
		WHERE po_audience_type.user_id = %[1]s
			AND po_audience_type.status = 'active'
			AND p_audience_type.type IN (%[2]s)
			%[3]s
	)`, userExpr, typeExpr, buildingClause)
}

func UserHasAnyPropertyOptionalBuildingPredicate(userExpr string, buildingExpr string) string {
	return fmt.Sprintf(`EXISTS (
		SELECT 1
		FROM property_owners po_audience
		JOIN property p_audience ON p_audience.id = po_audience.property_id
		WHERE po_audience.user_id = %[1]s
			AND po_audience.status = 'active'
			AND (%[2]s IS NULL OR p_audience.building_id = %[2]s)
	)`, userExpr, buildingExpr)
}

func UserHasPropertyTypeOptionalBuildingPredicate(userExpr string, buildingExpr string, typeExpr string) string {
	return fmt.Sprintf(`EXISTS (
		SELECT 1
		FROM property_owners po_audience_type
		JOIN property p_audience_type ON p_audience_type.id = po_audience_type.property_id
		WHERE po_audience_type.user_id = %[1]s
			AND po_audience_type.status = 'active'
			AND p_audience_type.type IN (%[2]s)
			AND (%[3]s IS NULL OR p_audience_type.building_id = %[3]s)
	)`, userExpr, typeExpr, buildingExpr)
}

func UserHasRolePredicate(userExpr string, roleExpr string) string {
	return fmt.Sprintf(`EXISTS (
		SELECT 1
		FROM user_roles ur_audience
		JOIN roles r_audience ON r_audience.id = ur_audience.role_id
		WHERE ur_audience.user_id = %[1]s
			AND r_audience.code = %[2]s
	)`, userExpr, roleExpr)
}
