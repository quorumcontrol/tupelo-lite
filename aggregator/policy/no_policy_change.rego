package tupelo.nopolicychange

default allow = false

modifies_policy {
    contains(input.block.transactions[_].setDataPayload.path, ".well-known/policy")
}

allow {
    not modifies_policy
}