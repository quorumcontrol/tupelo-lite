package main

import (
	"context"
	"testing"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
	"github.com/quorumcontrol/tupelo/sdk/gossip/testhelpers"
	"github.com/stretchr/testify/require"
)

func TestPublishesToMqtt(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	resolver := Setup()
	agg := resolver.Aggregator

	opts := mqtt.NewClientOptions()
	opts.AddBroker("tcp://localhost:1883")
	opts.ClientID = t.Name()
	cli := mqtt.NewClient(opts)
	tok := cli.Connect()
	didConnect := tok.WaitTimeout(2 * time.Second)
	require.True(t, didConnect)

	// TODO: type this chan
	resp := make(chan interface{})
	subTok := cli.Subscribe("public/trees/#", byte(0), func(cli mqtt.Client, msg mqtt.Message) {
		resp <- msg
	})
	didSubscribe := subTok.WaitTimeout(2 * time.Second)
	require.True(t, didSubscribe)

	// now send an ABR to the aggregator
	// and get the subscription!
	abr := testhelpers.NewValidTransaction(t)
	_, err := agg.Add(ctx, &abr)
	require.Nil(t, err)

	// and we should get a message
	<-resp

}
