package storage

import (
	"maildebug/types"
	"testing"
)

func msg() *types.MailData {
	return &types.MailData{
		From:          "news@shop.com",
		FromFormatted: "Shop News <news@shop.com>",
		To:            []string{"alice@example.com", "bob@example.com"},
		Subject:       "Your weekly receipt",
		Parts: []*types.PartData{
			{MediaType: "text/plain", Data: "Big sale inside, save now"},
		},
	}
}

func TestMatches(t *testing.T) {
	m := msg()
	tests := []struct {
		name   string
		filter types.SearchFilter
		want   bool
	}{
		{"empty matches all", types.SearchFilter{}, true},
		{"q hits subject", types.SearchFilter{Q: "receipt"}, true},
		{"q hits body", types.SearchFilter{Q: "SALE"}, true},
		{"q hits recipient", types.SearchFilter{Q: "bob@"}, true},
		{"q hits sender name", types.SearchFilter{Q: "shop news"}, true},
		{"q miss", types.SearchFilter{Q: "nonexistent"}, false},
		{"from match", types.SearchFilter{From: "news"}, true},
		{"to match", types.SearchFilter{To: "alice"}, true},
		{"subject match", types.SearchFilter{Subject: "weekly"}, true},
		{"body match", types.SearchFilter{Body: "save"}, true},
		{"AND all match", types.SearchFilter{From: "shop", Subject: "receipt"}, true},
		{"AND one misses", types.SearchFilter{From: "shop", Subject: "invoice"}, false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := Matches(m, tc.filter); got != tc.want {
				t.Errorf("Matches(%+v) = %v, want %v", tc.filter, got, tc.want)
			}
		})
	}
}
