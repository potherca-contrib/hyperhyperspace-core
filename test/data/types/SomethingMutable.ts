import { MutableObject, MutationOp, Hash, HashedObject } from 'data/model';

class SomethingMutable extends MutableObject {

    static className = 'hhs-test/SomethingMutable';

    _operations: Map<Hash, SomeMutation>;

    constructor() {
        super([SomeMutation.className]);

        this.setRandomId();

        this._operations = new Map();
    }

    getClassName() {
        return SomethingMutable.className;
    }

    init() {

    }

    validate(references: Map<string, HashedObject>): boolean {
        references;
        return true;
    }

    async mutate(_op: MutationOp): Promise<void> {
        this._operations.set(_op.hash(), _op);
    }

    getOperations() : Set<MutationOp>{
        return new Set(this._operations.values());
    }

    async testOperation(payload: string) {
        let op = new SomeMutation(this);
        op.payload = payload;
        await this.applyNewOp(op);
    }

}

SomethingMutable.registerClass(SomethingMutable.className, SomethingMutable);

class SomeMutation extends MutationOp {
    static className = 'hhs-test/SomeMutation';

    payload?: string;

    constructor(target?: MutableObject) {
        super(target);
    }

    getClassName() {
        return SomeMutation.className;
    }

    init() {
        
    }
}

SomeMutation.registerClass(SomeMutation.className, SomeMutation);

export { SomethingMutable, SomeMutation }