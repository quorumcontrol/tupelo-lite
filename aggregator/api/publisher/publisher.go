package publisher

import (
	"context"
	"fmt"

	logging "github.com/ipfs/go-log"

	cbornode "github.com/ipfs/go-ipld-cbor"
	format "github.com/ipfs/go-ipld-format"
	"github.com/quorumcontrol/chaintree/safewrap"
	"github.com/quorumcontrol/messages/v2/build/go/services"
	"github.com/quorumcontrol/tupelo-lite/aggregator"
)

var logger = logging.Logger("publisher")

func init() {
	cbornode.RegisterCborType(AddBlockMessage{})
}

// AddBlockMessage is sent to the message queue for every update
type AddBlockMessage struct {
	AddBlockRequest *services.AddBlockRequest
	NewBlocks       [][]byte
}

func blocksToBytes(blocks []format.Node) [][]byte {
	retBits := make([][]byte, len(blocks))
	for i, blk := range blocks {
		retBits[i] = blk.RawData()
	}
	return retBits
}

// MessageQueueFunc is the most basic "message queue" function - the edge of the internal system that takes a topic and bytes
// and sends them along
type MessageQueueFunc func(ctx context.Context, topic string, bits []byte) error

// StartPublishing takes the actual basic publisherFunc (the one that sends bits to a topic) and then will setup the goroutine, etc
// to call that function with the correct formats.
func StartPublishing(ctx context.Context, publishFunc MessageQueueFunc) (aggregator.UpdateChan, error) {
	// TODO: should this be a callback function?
	// there's no guarantee all these will get published
	updateCh := make(aggregator.UpdateChan, 2)
	go func() {
		for {
			// a new safewrap in case there are errors
			sw := &safewrap.SafeWrap{}
			wrapper := <-updateCh

			addBlockMessage := &AddBlockMessage{
				AddBlockRequest: wrapper.AddBlockRequest,
				NewBlocks:       blocksToBytes(wrapper.NewNodes),
			}
			wrapped := sw.WrapObject(addBlockMessage)
			if sw.Err != nil {
				logger.Errorf("error wrapping: %v", sw.Err)
				continue
			}
			err := publishFunc(ctx, fmt.Sprintf("public/trees/%s", string(wrapper.ObjectId)), wrapped.RawData())
			if err != nil {
				logger.Errorf("error publishing: %v", err)
				continue
			}
		}
	}()
	return updateCh, nil
}
