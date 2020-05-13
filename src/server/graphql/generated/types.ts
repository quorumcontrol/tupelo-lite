import { GraphQLResolveInfo, GraphQLScalarType, GraphQLScalarTypeConfig } from 'graphql';
export type Maybe<T> = T | null;
export type RequireFields<T, K extends keyof T> = { [X in Exclude<keyof T, K>]?: T[X] } & { [P in K]-?: NonNullable<T[P]> };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: string;
  String: string;
  Boolean: boolean;
  Int: number;
  Float: number;
  JSON: any;
};


export type Block = {
   __typename?: 'Block';
  data: Scalars['String'];
};

export type AddBlockPayload = {
   __typename?: 'AddBlockPayload';
  valid?: Maybe<Scalars['Boolean']>;
  newTip: Scalars['String'];
  newBlocks?: Maybe<Array<Block>>;
};

export type ResolvePayload = {
   __typename?: 'ResolvePayload';
  remainingPath?: Maybe<Array<Maybe<Scalars['String']>>>;
  value?: Maybe<Scalars['JSON']>;
};

export type ResolveInput = {
  did: Scalars['String'];
  path: Scalars['String'];
};

export type AddBlockInput = {
  addBlockRequest: Scalars['String'];
};

export type Query = {
   __typename?: 'Query';
  resolve?: Maybe<ResolvePayload>;
};


export type QueryResolveArgs = {
  input: ResolveInput;
};

export type Mutation = {
   __typename?: 'Mutation';
  addBlock?: Maybe<AddBlockPayload>;
};


export type MutationAddBlockArgs = {
  input: AddBlockInput;
};




export type ResolverTypeWrapper<T> = Promise<T> | T;


export type StitchingResolver<TResult, TParent, TContext, TArgs> = {
  fragment: string;
  resolve: ResolverFn<TResult, TParent, TContext, TArgs>;
};

export type Resolver<TResult, TParent = {}, TContext = {}, TArgs = {}> =
  | ResolverFn<TResult, TParent, TContext, TArgs>
  | StitchingResolver<TResult, TParent, TContext, TArgs>;

export type ResolverFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => Promise<TResult> | TResult;

export type SubscriptionSubscribeFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => AsyncIterator<TResult> | Promise<AsyncIterator<TResult>>;

export type SubscriptionResolveFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;

export interface SubscriptionSubscriberObject<TResult, TKey extends string, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<{ [key in TKey]: TResult }, TParent, TContext, TArgs>;
  resolve?: SubscriptionResolveFn<TResult, { [key in TKey]: TResult }, TContext, TArgs>;
}

export interface SubscriptionResolverObject<TResult, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<any, TParent, TContext, TArgs>;
  resolve: SubscriptionResolveFn<TResult, any, TContext, TArgs>;
}

export type SubscriptionObject<TResult, TKey extends string, TParent, TContext, TArgs> =
  | SubscriptionSubscriberObject<TResult, TKey, TParent, TContext, TArgs>
  | SubscriptionResolverObject<TResult, TParent, TContext, TArgs>;

export type SubscriptionResolver<TResult, TKey extends string, TParent = {}, TContext = {}, TArgs = {}> =
  | ((...args: any[]) => SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>)
  | SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>;

export type TypeResolveFn<TTypes, TParent = {}, TContext = {}> = (
  parent: TParent,
  context: TContext,
  info: GraphQLResolveInfo
) => Maybe<TTypes> | Promise<Maybe<TTypes>>;

export type isTypeOfResolverFn<T = {}> = (obj: T, info: GraphQLResolveInfo) => boolean | Promise<boolean>;

export type NextResolverFn<T> = () => Promise<T>;

export type DirectiveResolverFn<TResult = {}, TParent = {}, TContext = {}, TArgs = {}> = (
  next: NextResolverFn<TResult>,
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;

/** Mapping between all available schema types and the resolvers types */
export type ResolversTypes = {
  String: ResolverTypeWrapper<Scalars['String']>,
  Boolean: ResolverTypeWrapper<Scalars['Boolean']>,
  JSON: ResolverTypeWrapper<Scalars['JSON']>,
  Block: ResolverTypeWrapper<Block>,
  AddBlockPayload: ResolverTypeWrapper<AddBlockPayload>,
  ResolvePayload: ResolverTypeWrapper<ResolvePayload>,
  ResolveInput: ResolveInput,
  AddBlockInput: AddBlockInput,
  Query: ResolverTypeWrapper<{}>,
  Mutation: ResolverTypeWrapper<{}>,
};

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = {
  String: Scalars['String'],
  Boolean: Scalars['Boolean'],
  JSON: Scalars['JSON'],
  Block: Block,
  AddBlockPayload: AddBlockPayload,
  ResolvePayload: ResolvePayload,
  ResolveInput: ResolveInput,
  AddBlockInput: AddBlockInput,
  Query: {},
  Mutation: {},
};

export interface JsonScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['JSON'], any> {
  name: 'JSON'
}

export type BlockResolvers<ContextType = any, ParentType extends ResolversParentTypes['Block'] = ResolversParentTypes['Block']> = {
  data?: Resolver<ResolversTypes['String'], ParentType, ContextType>,
  __isTypeOf?: isTypeOfResolverFn<ParentType>,
};

export type AddBlockPayloadResolvers<ContextType = any, ParentType extends ResolversParentTypes['AddBlockPayload'] = ResolversParentTypes['AddBlockPayload']> = {
  valid?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>,
  newTip?: Resolver<ResolversTypes['String'], ParentType, ContextType>,
  newBlocks?: Resolver<Maybe<Array<ResolversTypes['Block']>>, ParentType, ContextType>,
  __isTypeOf?: isTypeOfResolverFn<ParentType>,
};

export type ResolvePayloadResolvers<ContextType = any, ParentType extends ResolversParentTypes['ResolvePayload'] = ResolversParentTypes['ResolvePayload']> = {
  remainingPath?: Resolver<Maybe<Array<Maybe<ResolversTypes['String']>>>, ParentType, ContextType>,
  value?: Resolver<Maybe<ResolversTypes['JSON']>, ParentType, ContextType>,
  __isTypeOf?: isTypeOfResolverFn<ParentType>,
};

export type QueryResolvers<ContextType = any, ParentType extends ResolversParentTypes['Query'] = ResolversParentTypes['Query']> = {
  resolve?: Resolver<Maybe<ResolversTypes['ResolvePayload']>, ParentType, ContextType, RequireFields<QueryResolveArgs, 'input'>>,
};

export type MutationResolvers<ContextType = any, ParentType extends ResolversParentTypes['Mutation'] = ResolversParentTypes['Mutation']> = {
  addBlock?: Resolver<Maybe<ResolversTypes['AddBlockPayload']>, ParentType, ContextType, RequireFields<MutationAddBlockArgs, 'input'>>,
};

export type Resolvers<ContextType = any> = {
  JSON?: GraphQLScalarType,
  Block?: BlockResolvers<ContextType>,
  AddBlockPayload?: AddBlockPayloadResolvers<ContextType>,
  ResolvePayload?: ResolvePayloadResolvers<ContextType>,
  Query?: QueryResolvers<ContextType>,
  Mutation?: MutationResolvers<ContextType>,
};


/**
 * @deprecated
 * Use "Resolvers" root object instead. If you wish to get "IResolvers", add "typesPrefix: I" to your config.
 */
export type IResolvers<ContextType = any> = Resolvers<ContextType>;
