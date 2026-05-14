import {
  prop,
  index,
  modelOptions,
  getModelForClass,
} from "@typegoose/typegoose";

export type IndexerStatus = "running" | "halted" | "error";

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

  @prop({ required: true })
  lastProcessedBlockHash!: string;

  @prop({ required: true, default: "running" })
  status!: IndexerStatus;
}

export const IndexerStateModel = getModelForClass(IndexerState);
