package policy

const NoPolicyChange = `
package tupelo.nopolicychange

default allow = false

modifies_policy {
    contains(input.transactions[_].setDataPayload.path, ".well-known/policies")
}

allow {
    not modifies_policy
}
`
