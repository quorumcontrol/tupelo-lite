package api

import (
	"testing"

	"github.com/ethereum/go-ethereum/crypto"
	"github.com/stretchr/testify/require"
)

func TestNewChallenge(t *testing.T) {
	key, err := crypto.GenerateKey()
	require.Nil(t, err)
	chal, err := NewChallenge(key)
	require.Nil(t, err)
	require.NotNil(t, chal)
}

func TestToString(t *testing.T) {
	key, err := crypto.GenerateKey()
	require.Nil(t, err)
	chal, err := NewChallenge(key)
	require.Nil(t, err)

	str, err := chal.String()
	require.Nil(t, err)
	require.Len(t, str, 172)
}
