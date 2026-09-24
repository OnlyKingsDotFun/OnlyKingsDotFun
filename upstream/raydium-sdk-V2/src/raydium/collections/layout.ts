import { blob, bool, publicKey, seq, struct, u16, u32, u64, u8 } from "../../marshmallow";

/** Ruleset: admin-defined admission rule. */
export const RulesetLayout = struct([
  blob(8),
  u8("bump"),
  u16("index"),
  u8("kind"),
  u8("flags"),
  blob(3),
  publicKey("programId"),
  seq(u64(), 8, "padding"),
]);

/** TokenCollection: permissionless set bound to a ruleset and a quote mint. */
export const TokenCollectionLayout = struct([
  blob(8),
  u8("bump"),
  u16("index"),
  blob(5),
  publicKey("authority"),
  publicKey("ruleset"),
  publicKey("quoteMint"),
  u32("rebalanceFeeDivisor"),
  u32("memberCount"),
  seq(u64(), 8, "padding"),
]);

/** CollectionMember: proof that a mint satisfied the ruleset; carries its rate (1e9 == 1.0). */
export const CollectionMemberLayout = struct([
  blob(8),
  u8("bump"),
  blob(7),
  publicKey("collection"),
  publicKey("mint"),
  u64("rate"),
  publicKey("registeredBy"),
  seq(u64(), 8, "padding"),
]);

export const PoolMemberLayout = struct([
  publicKey("mint"),
  publicKey("vault"),
  u8("decimals"),
  blob(7),
  u64("protocolFeesOwed"),
  u64("fundFeesOwed"),
  seq(u64(), 2, "padding"),
]);

/** PoolMembers: a pair bound to a collection, with up to 8 member vaults. */
export const PoolMembersLayout = struct([
  blob(8),
  u8("bump"),
  bool("baseIsToken0"),
  u8("n"),
  blob(5),
  publicKey("pool"),
  publicKey("collection"),
  u64("amp"),
  seq(PoolMemberLayout, 8, "members"),
  seq(u64(), 8, "padding"),
]);

export const MAX_POOL_MEMBERS = 8;
export const RATE_ONE = 1_000_000_000;

export enum RuleKind {
  Any = 0,
  PumpFunLaunch = 1,
  ImmutableMint = 2,
  Lst = 3,
}
export const RULE_FLAG_ALLOW_MAYHEM = 1;
export const RULE_FLAG_REQUIRE_COMPLETE = 2;
