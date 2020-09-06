
import { HashedObject, Literal } from './HashedObject';
import { Hash, Hashing } from './Hashing';
import { Store } from 'storage/store';
import { Mesh } from 'mesh/service';

type LiteralContext = { rootHashes: Array<Hash>, literals: any };

type Resources = { store: Store, mesh: Mesh, config: any, aliasing: Map<Hash, HashedObject> };

class Context {

    rootHashes : Array<Hash>;
    objects  : Map<Hash, HashedObject>;
    literals : Map<Hash, Literal>;
    //aliased?: Map<Hash, HashedObject>;
    resources?: Partial<Resources>;

    constructor() {
        this.rootHashes = [];
        this.objects    = new Map();
        this.literals   = new Map();
    }

    has(hash: Hash) {
        return this.literals.has(hash) || this.objects.has(hash) ||
               (this?.resources?.aliasing!== undefined && this.resources.aliasing.has(hash));
    }

    toLiteralContext() : LiteralContext {
        return { rootHashes: Array.from(this.rootHashes), literals: Object.fromEntries(this.literals.entries()) };
    }

    fromLiteralContext(literalContext: LiteralContext) : void {
        this.rootHashes = Array.from(literalContext.rootHashes);
        this.literals = new Map(Object.entries(literalContext.literals));
        this.objects = new Map();
    }

    merge(other: Context) {
        const roots = new Set(this.rootHashes.concat(other.rootHashes));
        this.rootHashes = Array.from(roots);

        for (const [hash, literal] of other.literals.entries()) {
            if (!this.literals.has(hash)) {
                this.literals.set(hash, literal);
            }
        }

        for (const [hash, obj] of other.objects.entries()) {
            if (!this.objects.has(hash)) {
                this.objects.set(hash, obj);
            }
        }

        if (other?.resources?.aliasing !== undefined) {
            
            if (this.resources === undefined) {
                this.resources = {};
            }

            if (this.resources.aliasing === undefined) {
                this.resources.aliasing = new Map();
            }

            for (const [hash, aliased] of other.resources.aliasing.entries()) {
                if (!this.resources.aliasing.has(hash)) {
                    this.resources.aliasing.set(hash, aliased);
                }
            }
        }

        
    }

    // if a dependency is in more than one subobject, it will pick one of the shortest dep chains.
    findMissingDeps(hash: Hash, chain?: Array<Hash>, missing?: Map<Hash, Array<Hash>>) : Map<Hash, Array<Hash>> {
        
        if (chain === undefined) {
            chain = [];
        }

        if (missing === undefined) {
            missing = new Map();
        }

        let literal = this.literals.get(hash);

        if (literal === undefined) {
            let prevChain = missing.get(hash);

            if (prevChain === undefined || chain.length < prevChain.length) {
                missing.set(hash, chain);
            }

        } else {
            for (const dep of literal.dependencies) {
                let newChain = chain.slice();
                newChain.unshift(hash);
                this.findMissingDeps(dep.hash, newChain, missing);
            }
        }

        return missing;;
    }

    checkLiteralHashes() : boolean {

        let result = true;

        for (const [hash, literal] of this.literals.entries()) {
            if (hash !== literal.hash || hash !== Hashing.forValue(literal.value)) {
                result = false;
                break;
            }
        }

        return result;
    }

    checkRootHashes() : boolean {

        let result = true;

        for (const hash of this.rootHashes) {
            if (!this.literals.has(hash)) {
                result = false;
                break;
            }
        }

        return result;
    }
}

export { Context, LiteralContext, Resources }