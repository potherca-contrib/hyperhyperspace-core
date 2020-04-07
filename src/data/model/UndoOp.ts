import { MutationOp } from './MutationOp';
import { HashedSet } from './HashedSet';
import { MutableObject } from './MutableObject';
import { ReversibleOp } from './ReversibleOp';
import { LiteralContext } from './HashedObject';
import { Hash } from './Hashing';


class UndoOp extends MutationOp {

    static className = 'hhs/UndoOp';

    targetOp?: ReversibleOp;
    cascadeOf?: UndoOp;

    constructor(target?: MutableObject, targetOp?: ReversibleOp, cascadeOf?: UndoOp) {
        super(target, targetOp === undefined? undefined : new HashedSet([targetOp].values()));

        if (targetOp instanceof UndoOp) {
            throw new Error("And undo op can't be undone this way, please just re-issue the original op");
        }

        if (targetOp !== undefined) {
            this.targetOp = targetOp;
        }

        if (cascadeOf !== undefined) {
            this.cascadeOf = cascadeOf;
        }
    }

    getTargetOp() : MutationOp {
        return this.targetOp as MutationOp;
    }

    getClassName() {
        return UndoOp.className;
    }

    literalizeInContext(context: LiteralContext, path: string, flags?: Array<string>) : Hash {

        if (flags === undefined) {
            flags = [];
        }

        flags.push('undo');

        return super.literalizeInContext(context, path, flags);

    }

}

export { UndoOp }