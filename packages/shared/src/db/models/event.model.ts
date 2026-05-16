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

  @prop({ required: true, lowercase: true })
  integrator!: string;

  @prop({ required: true })
  blockNumber!: number;

  @prop({ required: true })
  transactionHash!: string;

  @prop({ required: true })
  logIndex!: number;

  @prop({ required: true })
  public blockTimestamp!: Date;

  @prop({ required: true, lowercase: true })
  public token!: string;

  @prop({ required: true })
  public integratorFee!: string;

  @prop({ required: true })
  public lifiFee!: string;
}

export const FeeCollectedEventModel = getModelForClass(FeeCollectedEvent);
