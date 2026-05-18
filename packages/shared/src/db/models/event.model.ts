import {
  prop,
  modelOptions,
  index,
  getModelForClass,
} from "@typegoose/typegoose";

@index({ chainId: 1, transactionHash: 1, logIndex: 1 }, { unique: true })
@index({ integrator: 1, blockNumber: -1, logIndex: -1 })
@modelOptions({ schemaOptions: { collection: "events", timestamps: true } })
export class FeeCollectedEvent {
  @prop({ required: true })
  chainId!: number;

  // lowercase: true only applies on insert, not on query. The API
  // validator lowercases the filter to keep both sides aligned.
  @prop({ required: true, lowercase: true })
  integrator!: string;

  @prop({ required: true })
  blockNumber!: number;

  @prop({ required: true })
  transactionHash!: string;

  @prop({ required: true })
  logIndex!: number;

  @prop({ required: true })
  blockTimestamp!: Date;

  @prop({ required: true, lowercase: true })
  token!: string;

  @prop({ required: true })
  integratorFee!: string;

  @prop({ required: true })
  lifiFee!: string;
}

export const FeeCollectedEventModel = getModelForClass(FeeCollectedEvent);
