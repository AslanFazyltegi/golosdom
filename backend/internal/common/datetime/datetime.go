package datetime

import (
	"strings"
	"time"
)

const AstanaTimeZone = "Asia/Almaty"

var astanaLocation = mustLoadAstanaLocation()

func Location() *time.Location {
	return astanaLocation
}

func Now() time.Time {
	return time.Now().In(astanaLocation)
}

func ParseAstanaDateTime(value string) (time.Time, error) {
	value = strings.TrimSpace(value)

	for _, layout := range []string{
		"2006-01-02T15:04:05",
		"2006-01-02T15:04",
	} {
		parsed, err := time.ParseInLocation(layout, value, astanaLocation)
		if err == nil {
			return parsed, nil
		}
	}

	parsed, err := time.Parse(time.RFC3339, value)
	if err != nil {
		return time.Time{}, err
	}

	return parsed.In(astanaLocation), nil
}

func AsAstanaWallTime(value time.Time) time.Time {
	if value.IsZero() {
		return value
	}

	year, month, day := value.Date()
	hour, minute, second := value.Clock()

	return time.Date(year, month, day, hour, minute, second, value.Nanosecond(), astanaLocation)
}

func PtrAsAstanaWallTime(value *time.Time) *time.Time {
	if value == nil {
		return nil
	}

	converted := AsAstanaWallTime(*value)
	return &converted
}

func mustLoadAstanaLocation() *time.Location {
	location, err := time.LoadLocation(AstanaTimeZone)
	if err != nil {
		panic(err)
	}
	return location
}
