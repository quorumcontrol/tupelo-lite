package api

import (
	"crypto/ecdsa"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"time"

	"github.com/ethereum/go-ethereum/crypto"
	"github.com/quorumcontrol/chaintree/safewrap"

	cbornode "github.com/ipfs/go-ipld-cbor"
)

func init() {
	cbornode.RegisterCborType(Challenge{})
	cbornode.RegisterCborType(ChallengeWithSignature{})
	cbornode.RegisterCborType(time.Time{})
}

// Challenge is signed by tupelo-lite and
// then sent to the client which then uses
// its private key to prove ownership of a ChainTree
type Challenge struct {
	CreatedAt time.Time
	Bits      []byte
}

type ChallengeWithSignature struct {
	Challenge
	Signature []byte
}

func NewChallenge(k *ecdsa.PrivateKey) (*ChallengeWithSignature, error) {
	bits := make([]byte, 32) // 32 byte random bits
	_, err := rand.Read(bits)
	if err != nil {
		return nil, fmt.Errorf("error filling bits: %w", err)
	}

	challenge := Challenge{
		CreatedAt: time.Now().UTC(),
		Bits:      bits,
	}

	sw := &safewrap.SafeWrap{}
	wrapped := sw.WrapObject(challenge)
	if sw.Err != nil {
		return nil, fmt.Errorf("error wrapping: %w", sw.Err)
	}

	multiHash := []byte(wrapped.Cid().Hash())

	sig, err := crypto.Sign(multiHash[2:], k)
	if err != nil {
		return nil, fmt.Errorf("error signing: %w", err)
	}

	return &ChallengeWithSignature{
		Challenge: challenge,
		Signature: sig,
	}, nil
}

func (c ChallengeWithSignature) String() (string, error) {
	sw := &safewrap.SafeWrap{}
	wrapped := sw.WrapObject(c)
	if sw.Err != nil {
		return "", fmt.Errorf("error wrapping: %w", sw.Err)
	}
	return base64.StdEncoding.EncodeToString(wrapped.RawData()), nil
}
