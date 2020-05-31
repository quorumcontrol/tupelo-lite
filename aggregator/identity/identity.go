package identity

import (
	"crypto/ecdsa"
	"encoding/base64"
	"fmt"
	"time"

	"github.com/ethereum/go-ethereum/crypto"
	cbornode "github.com/ipfs/go-ipld-cbor"
	format "github.com/ipfs/go-ipld-format"
	"github.com/quorumcontrol/chaintree/safewrap"
)

func init() {
	cbornode.RegisterCborType(Identity{})
	cbornode.RegisterCborType(IdentityWithSignature{})

}

// Unfortunately to use either JWT or HTTP Signature authorization would require going through
// a lot of hoops because the only identifier we have in a ChainTree is the *address* which requires
// the specific libseccp256 curve to authenticate against and that isn't supported
// by any of the bodies - so we're going to create our own auth (boo) but model it
// on JWTs

func nodeToHash(node format.Node) []byte {
	multiHash := []byte(node.Cid().Hash())
	return multiHash[2:]
}

// Identity is closely related to a JWT but the signing and transport is different
// see note above
type Identity struct {
	Iss string // usually DID
	Sub string // usually DID
	Aud string // can be used by policy but not used by server
	Exp int64  // seconds since the epoch
	Iat int64  // seconds since the epoch
}

type IdentityWithSignature struct {
	Identity
	Signature []byte
}

func (i *Identity) Sign(key *ecdsa.PrivateKey) (*IdentityWithSignature, error) {
	sw := &safewrap.SafeWrap{}
	wrapped := sw.WrapObject(i)
	if sw.Err != nil {
		return nil, fmt.Errorf("error wrapping: %w", sw.Err)
	}

	sig, err := crypto.Sign(nodeToHash(wrapped), key)
	if err != nil {
		return nil, fmt.Errorf("error signing: %w", err)
	}
	return &IdentityWithSignature{
		Identity:  *i,
		Signature: sig,
	}, nil
}

func (is *IdentityWithSignature) Verify() (bool, error) {
	sw := &safewrap.SafeWrap{}
	wrapped := sw.WrapObject(is.Identity)
	if sw.Err != nil {
		return false, fmt.Errorf("error wrapping: %w", sw.Err)
	}
	recoveredPub, err := crypto.SigToPub(nodeToHash(wrapped), is.Signature)
	if err != nil {
		return false, fmt.Errorf("error recovering signature: %w", err)
	}

	verified := crypto.VerifySignature(crypto.FromECDSAPub(recoveredPub), nodeToHash(wrapped), is.Signature[:len(is.Signature)-1])
	if !verified {
		return false, nil
	}

	now := time.Now().UTC().Unix()
	fmt.Println("is verified: ", now, is.Identity.Exp)

	return (is.Identity.Exp > now), nil
}

func (is *IdentityWithSignature) String() string {
	sw := &safewrap.SafeWrap{}
	wrapped := sw.WrapObject(is)
	return base64.StdEncoding.EncodeToString(wrapped.RawData())
}

func (is *IdentityWithSignature) Address() (string, error) {
	sw := &safewrap.SafeWrap{}
	wrapped := sw.WrapObject(is.Identity)
	if sw.Err != nil {
		return "", fmt.Errorf("error wrapping: %w", sw.Err)
	}
	recoveredPub, err := crypto.SigToPub(nodeToHash(wrapped), is.Signature)
	if err != nil {
		return "", fmt.Errorf("error recovering signature: %w", err)
	}
	return crypto.PubkeyToAddress(*recoveredPub).String(), nil
}

func FromString(base64EncodedString string) (*IdentityWithSignature, error) {
	bits, err := base64.StdEncoding.DecodeString(base64EncodedString)
	if err != nil {
		return nil, fmt.Errorf("error decoding: %v", err)
	}
	is := &IdentityWithSignature{}
	err = cbornode.DecodeInto(bits, is)
	return is, err
}
