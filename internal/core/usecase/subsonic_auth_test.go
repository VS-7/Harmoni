package usecase_test

import (
	"context"
	"crypto/md5"
	"encoding/hex"
	"testing"

	"harmoni/internal/core/usecase"
)

func TestSubsonicAuthenticate(t *testing.T) {
	ctx := context.Background()
	user := "admin"
	pass := "secret123"
	salt := "randomsalt"

	hash := md5.Sum([]byte(pass + salt))
	token := hex.EncodeToString(hash[:])

	svc := usecase.NewSubsonicService(user, pass, nil, nil, nil, nil)

	// Valid auth
	ok, err := svc.Authenticate(ctx, user, token, salt)
	if err != nil || !ok {
		t.Errorf("expected authentication to succeed, got ok=%v, err=%v", ok, err)
	}

	// Invalid password/token
	badHash := md5.Sum([]byte("wrong" + salt))
	badToken := hex.EncodeToString(badHash[:])
	ok, err = svc.Authenticate(ctx, user, badToken, salt)
	if err != nil || ok {
		t.Errorf("expected authentication to fail for bad token, got ok=%v", ok)
	}

	// Invalid user
	ok, err = svc.Authenticate(ctx, "wronguser", token, salt)
	if err != nil || ok {
		t.Errorf("expected authentication to fail for wrong user, got ok=%v", ok)
	}
}
