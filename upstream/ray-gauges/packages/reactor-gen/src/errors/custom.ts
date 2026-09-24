export type CustomError =
  | IsoRayNotUpToDate
  | InsufficientRayBalance
  | InsufficientRayToPledge
  | InsufficientRayToUnpledge
  | InsufficientVotesToLock
  | InsufficientVotesToUnlock
  | InsufficientVotesToWithdraw
  | NotAdmin

export class IsoRayNotUpToDate extends Error {
  static readonly code = 6000
  readonly code = 6000
  readonly name = "IsoRayNotUpToDate"
  readonly msg = "isoRAY balance is not up-to-date"

  constructor(readonly logs?: string[]) {
    super("6000: isoRAY balance is not up-to-date")
  }
}

export class InsufficientRayBalance extends Error {
  static readonly code = 6001
  readonly code = 6001
  readonly name = "InsufficientRayBalance"
  readonly msg = "Insufficient RAY balance for withdrawal"

  constructor(readonly logs?: string[]) {
    super("6001: Insufficient RAY balance for withdrawal")
  }
}

export class InsufficientRayToPledge extends Error {
  static readonly code = 6002
  readonly code = 6002
  readonly name = "InsufficientRayToPledge"
  readonly msg = "Isufficient RAY to pledge"

  constructor(readonly logs?: string[]) {
    super("6002: Isufficient RAY to pledge")
  }
}

export class InsufficientRayToUnpledge extends Error {
  static readonly code = 6003
  readonly code = 6003
  readonly name = "InsufficientRayToUnpledge"
  readonly msg = "Insufficient RAY to unpledge"

  constructor(readonly logs?: string[]) {
    super("6003: Insufficient RAY to unpledge")
  }
}

export class InsufficientVotesToLock extends Error {
  static readonly code = 6004
  readonly code = 6004
  readonly name = "InsufficientVotesToLock"
  readonly msg = "Insufficient votes to lock"

  constructor(readonly logs?: string[]) {
    super("6004: Insufficient votes to lock")
  }
}

export class InsufficientVotesToUnlock extends Error {
  static readonly code = 6005
  readonly code = 6005
  readonly name = "InsufficientVotesToUnlock"
  readonly msg = "Insufficient votes to unlock"

  constructor(readonly logs?: string[]) {
    super("6005: Insufficient votes to unlock")
  }
}

export class InsufficientVotesToWithdraw extends Error {
  static readonly code = 6006
  readonly code = 6006
  readonly name = "InsufficientVotesToWithdraw"
  readonly msg = "Insufficient unlocked votes to withdraw"

  constructor(readonly logs?: string[]) {
    super("6006: Insufficient unlocked votes to withdraw")
  }
}

export class NotAdmin extends Error {
  static readonly code = 6007
  readonly code = 6007
  readonly name = "NotAdmin"
  readonly msg = "Not admin"

  constructor(readonly logs?: string[]) {
    super("6007: Not admin")
  }
}

export function fromCode(code: number, logs?: string[]): CustomError | null {
  switch (code) {
    case 6000:
      return new IsoRayNotUpToDate(logs)
    case 6001:
      return new InsufficientRayBalance(logs)
    case 6002:
      return new InsufficientRayToPledge(logs)
    case 6003:
      return new InsufficientRayToUnpledge(logs)
    case 6004:
      return new InsufficientVotesToLock(logs)
    case 6005:
      return new InsufficientVotesToUnlock(logs)
    case 6006:
      return new InsufficientVotesToWithdraw(logs)
    case 6007:
      return new NotAdmin(logs)
  }

  return null
}
