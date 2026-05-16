import {
  prop,
  index,
  modelOptions,
  getModelForClass,
} from "@typegoose/typegoose";

export type IndexerStatus = "running" | "halted";

@modelOptions({
  schemaOptions: {
    collection: "indexer_states",
    timestamps: true,
  },
})
export class IndexerState {
  @prop({ required: true, index: true, unique: true })
  chainId!: number;

  @prop({ required: true })
  lastProcessedBlockNumber!: number;

  @prop()
  lastProcessedBlockHash?: string;

  @prop({ required: true, default: "running" })
  status!: IndexerStatus;

  @prop()
  lastError?: string;

  @prop()
  lastErrorAt?: Date;
}

export const IndexerStateModel = getModelForClass(IndexerState);
