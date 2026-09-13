package httpapi

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCheckoutDemoInstructionsOnlyForTestKeys(t *testing.T) {
	for _, sandbox := range []bool{true, false} {
		prefix := "live"
		if sandbox {
			prefix = "test"
		}
		s := &Server{config: Config{StripePublishableKey: "pk_" + prefix + "_example"}}
		response := httptest.NewRecorder()
		s.checkoutPage(response, httptest.NewRequest("GET", "/checkout", nil))
		if response.Code != 200 {
			t.Fatalf("checkout status: %d", response.Code)
		}
		if strings.Contains(response.Body.String(), "4242 4242 4242 4242") != sandbox {
			t.Fatalf("unexpected test-card instructions for sandbox=%v", sandbox)
		}
	}
}
