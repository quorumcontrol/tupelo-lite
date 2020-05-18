import { expect } from 'chai'
import 'mocha'
import {EcdsaKey} from './ecdsa'

describe('EcdsaKeys', ()=> {
    it('generates a pair', async ()=> {
        const key = await EcdsaKey.generate()
        expect(key.publicKey).to.have.length(65)
        expect(key.privateKey).to.have.length(32)
    })

    it('generates with a passphrase', async ()=> {
        const expected = Buffer.from('5b94858eda63d4e812a5ed98a2e0c8e0efcbf27269caa29de96c7a93cc730914', 'hex')
        const phrase = Buffer.from('secretPassword', 'utf-8')
        const salt = Buffer.from('salt', 'utf-8')
        const key = await EcdsaKey.passPhraseKey(phrase,salt)
        expect(key.publicKey).to.have.length(65)
        expect(key.privateKey).to.have.length(32)
        expect(Buffer.from(key.privateKey!).equals(expected)).to.be.true
    })

    it('generates with bytes', async () => {
        const original = await EcdsaKey.generate()
        if (original.privateKey !== undefined) {
            const key = await EcdsaKey.fromBytes(original.privateKey)
            expect(key.publicKey).to.have.length(65)
            expect(key.privateKey).to.have.length(32)
        }
    })
})