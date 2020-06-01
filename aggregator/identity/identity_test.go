package identity

import (
	"context"
	"testing"
	"time"

	"github.com/ethereum/go-ethereum/crypto"
	"github.com/quorumcontrol/tupelo-lite/aggregator/testgetter"
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
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	key, err := crypto.GenerateKey()
	require.Nil(t, err)
	addr := crypto.PubkeyToAddress(key.PublicKey).String()
	did := "did:tupelo:" + addr
	ident, err := (&Identity{
		Iss: did,
		Sub: did,
		Exp: time.Now().UTC().Unix() + 5000,
	}).Sign(key)
	require.Nil(t, err)

	tree := testgetter.NewChaintreeOwnedBy(t, ctx, addr, []string{addr})
	getter := testgetter.NewDagGetter(t, ctx, tree)

	verified, err := ident.Verify(ctx, getter)
	require.Nil(t, err)
	require.True(t, verified)

	// it fails when the tree isn't owned by the signer
	tree2 := testgetter.NewChaintreeOwnedBy(t, ctx, addr, []string{})
	getter2 := testgetter.NewDagGetter(t, ctx, tree2)

	verified2, err := ident.Verify(ctx, getter2)
	require.Nil(t, err)
	require.False(t, verified2)
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
