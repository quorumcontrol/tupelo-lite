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
	format "github.com/ipfs/go-ipld-format"
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

func nodeToHash(node format.Node) []byte {
	multiHash := []byte(node.Cid().Hash())
	return multiHash[2:]
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
	fmt.Println("singing: ", nodeToHash(wrapped))

	sig, err := crypto.Sign(nodeToHash(wrapped), k)
	if err != nil {
		return nil, fmt.Errorf("error signing: %w", err)
	}
	fmt.Println("sig: ", sig)

	return &ChallengeWithSignature{
		Challenge: challenge,
		Signature: sig,
	}, nil
}

func ChallengeFromString(base64EncodedString string) (*ChallengeWithSignature, error) {
	bits, err := base64.StdEncoding.DecodeString(base64EncodedString)
	if err != nil {
		return nil, fmt.Errorf("error decoding: %v", err)
	}
	chal := &ChallengeWithSignature{}
	err = cbornode.DecodeInto(bits, chal)
	return chal, err
}

func (c ChallengeWithSignature) String() (string, error) {
	sw := &safewrap.SafeWrap{}
	wrapped := sw.WrapObject(c)
	if sw.Err != nil {
		return "", fmt.Errorf("error wrapping: %w", sw.Err)
	}
	return base64.StdEncoding.EncodeToString(wrapped.RawData()), nil
}

func (c ChallengeWithSignature) Verify(key ecdsa.PublicKey) (bool, error) {
	sw := &safewrap.SafeWrap{}
	wrapped := sw.WrapObject(c.Challenge)
	if sw.Err != nil {
		return false, fmt.Errorf("error wrapping: %w", sw.Err)
	}

	verified := crypto.VerifySignature(crypto.FromECDSAPub(&key), nodeToHash(wrapped), c.Signature[:len(c.Signature)-1])
	return verified, nil
}
