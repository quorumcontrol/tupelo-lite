package main

import (
	"fmt"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
	"github.com/fhmq/hmq/broker"
)

// fs.BoolVar(&help, "h", false, "Show this message.")
// 	fs.BoolVar(&help, "help", false, "Show this message.")
// 	fs.IntVar(&config.Worker, "w", 1024, "worker num to process message, perfer (client num)/10.")
// 	fs.IntVar(&config.Worker, "worker", 1024, "worker num to process message, perfer (client num)/10.")
// 	fs.StringVar(&config.HTTPPort, "httpport", "8080", "Port to listen on.")
// 	fs.StringVar(&config.HTTPPort, "hp", "8080", "Port to listen on.")
// 	fs.StringVar(&config.Port, "port", "1883", "Port to listen on.")
// 	fs.StringVar(&config.Port, "p", "1883", "Port to listen on.")
// 	fs.StringVar(&config.Host, "host", "0.0.0.0", "Network host to listen on")
// 	fs.StringVar(&config.Cluster.Port, "cp", "", "Cluster port from which members can connect.")
// 	fs.StringVar(&config.Cluster.Port, "clusterport", "", "Cluster port from which members can connect.")
// 	fs.StringVar(&config.Router, "r", "", "Router who maintenance cluster info")
// 	fs.StringVar(&config.Router, "router", "", "Router who maintenance cluster info")
// 	fs.StringVar(&config.WsPort, "ws", "", "port for ws to listen on")
// 	fs.StringVar(&config.WsPort, "wsport", "", "port for ws to listen on")
// 	fs.StringVar(&config.WsPath, "wsp", "", "path for ws to listen on")
// 	fs.StringVar(&config.WsPath, "wspath", "", "path for ws to listen on")
// 	fs.StringVar(&configFile, "config", "", "config file for hmq")
// 	fs.StringVar(&configFile, "c", "", "config file for hmq")
// 	fs.BoolVar(&config.Debug, "debug", false, "enable Debug logging.")
// 	fs.BoolVar(&config.Debug, "d", false, "enable Debug logging.")

func StartMQTT() (mqtt.Client, error) {

	// TODO: make these ports configurable
	b, err := broker.NewBroker(&broker.Config{
		Worker:   1024,
		Port:     "1883",
		HTTPPort: "8080",
		WsTLS:    false,
		WsPath:   "/mqtt",
		WsPort:   "8081",
		Host:     "0.0.0.0",
	})
	if err != nil {
		return nil, fmt.Errorf("error starting broker")
	}
	b.Start()

	mqttOpts := mqtt.NewClientOptions()
	mqttOpts.AddBroker("tcp://localhost:1883")
	mqttOpts.ClientID = "server-internal"
	cli := mqtt.NewClient(mqttOpts)
	tok := cli.Connect()
	didConnect := tok.WaitTimeout(2 * time.Second)
	if !didConnect {
		return nil, fmt.Errorf("timeout waiting for client")
	}

	return cli, nil
}
