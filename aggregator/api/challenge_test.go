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

func TestVerify(t *testing.T) {
	key, err := crypto.GenerateKey()
	require.Nil(t, err)
	chal, err := NewChallenge(key)
	require.Nil(t, err)

	verified, err := chal.Verify(key.PublicKey)
	require.Nil(t, err)
	require.True(t, verified)

	// change a signature bit to make sure it doesn't verify
	chal.Signature[0] = byte(0)
	verified, err = chal.Verify(key.PublicKey)
	require.Nil(t, err)
	require.False(t, verified)
}

func TestFromString(t *testing.T) {
	key, err := crypto.GenerateKey()
	require.Nil(t, err)
	chal, err := NewChallenge(key)
	require.Nil(t, err)

	str, err := chal.String()
	require.Nil(t, err)

	newChal, err := ChallengeFromString(str)
	require.Nil(t, err)
	require.Equal(t, chal.Bits, newChal.Bits)
}
