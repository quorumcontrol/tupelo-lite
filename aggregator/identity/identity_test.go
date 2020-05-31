package identity

import (
	"testing"
	"time"

	"github.com/ethereum/go-ethereum/crypto"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestToString(t *testing.T) {
	key, err := crypto.GenerateKey()
	require.Nil(t, err)

	ident, err := (&Identity{
		Iss: "did:justatest",
		Exp: time.Now().UTC().Unix() + 5000,
	}).Sign(key)
	require.Nil(t, err)

	str := ident.String()
	require.Nil(t, err)
	require.Len(t, str, 160)
}

func TestVerify(t *testing.T) {
	key, err := crypto.GenerateKey()
	require.Nil(t, err)

	ident, err := (&Identity{
		Iss: "did:justatest",
		Exp: time.Now().UTC().Unix() + 5000,
	}).Sign(key)
	require.Nil(t, err)

	verified, err := ident.Verify()
	require.Nil(t, err)
	require.True(t, verified)
}

func TestAddress(t *testing.T) {
	key, err := crypto.GenerateKey()
	require.Nil(t, err)

	ident, err := (&Identity{
		Iss: "did:justatest",
		Exp: time.Now().UTC().Unix() + 5000,
	}).Sign(key)
	require.Nil(t, err)

	expected := crypto.PubkeyToAddress(key.PublicKey).String()
	addr, err := ident.Address()
	require.Nil(t, err)
	assert.Equal(t, expected, addr)
}

func TestFromString(t *testing.T) {
	key, err := crypto.GenerateKey()
	require.Nil(t, err)

	ident, err := (&Identity{
		Iss: "did:justatest",
		Exp: time.Now().UTC().Unix() + 5000,
	}).Sign(key)
	require.Nil(t, err)

	str := ident.String()
	require.Nil(t, err)

	newIdent, err := FromString(str)
	require.Nil(t, err)
	require.Equal(t, ident.Identity.Iss, newIdent.Identity.Iss)
}
