import type { Prisma, PrismaClient } from "@/generated/prisma/client";

/**
 * Loose marker for the presence of `runInTransaction` on a repository.
 *
 * We don't constrain the `uow` parameter type because repositories differ on
 * whether the UoW type matches the repository type (e.g. `CameraRepository`
 * uses the same type for both) or whether it's a narrower base interface
 * (e.g. `CommunityMembershipRepository extends CommunityUnitOfWork`,
 * `PlatformCommunityRepository = PlatformCommunityUnitOfWork & {...}`).
 * The actual UoW type is supplied via the `TUnitOfWork` generic.
 */
type HasRunInTransaction = {
  runInTransaction(op: (uow: unknown) => Promise<unknown>): Promise<unknown>;
};

/**
 * The argument accepted by `buildUow` is either the top-level `PrismaClient`
 * (when constructing the direct UoW) or a `Prisma.TransactionClient` (when
 * constructing the scoped UoW inside a transaction). The two share the
 * query API surface that repository code uses.
 */
type PrismaClientLike = PrismaClient | Prisma.TransactionClient;

/**
 * Wraps a UnitOfWork factory with the standard transactional repository
 * boilerplate used by every Prisma-backed repository in the codebase.
 *
 * The previous shape (duplicated across 6 repositories) was:
 *
 * ```ts
 * const directUow = createUnitOfWork(prisma);
 * return {
 *   ...directUow,
 *   runInTransaction<T>(operation: (uow: TRepo) => Promise<T>): Promise<T> {
 *     return prisma.$transaction(async (tx) => {
 *       const scopedUow = createUnitOfWork(tx);
 *       return operation(scopedUow);
 *     });
 *   },
 * };
 * ```
 *
 * Inside `createUnitOfWork` itself, `runInTransaction` is defined to throw
 * an error because the scoped UoW must not start a nested transaction —
 * `prisma.$transaction` already provides the boundary.
 *
 * The helper preserves that contract: the spread of `buildUow(prisma)` keeps
 * the throwing `runInTransaction` from the direct UoW, and the explicit
 * override replaces it with the functional version for the top-level
 * repository returned to callers. Domain services only ever interact with
 * the top-level repository, so they only see the functional override.
 *
 * @param prisma - The Prisma client to use for direct queries and as the
 *                 transaction boundary.
 * @param buildUow - Factory that builds a UnitOfWork scoped to a Prisma
 *                   client (either top-level or transactional).
 * @returns A repository object that exposes all UoW methods plus a
 *          functional `runInTransaction` at the top level.
 */
export function createTransactionalRepository<
  TRepo extends HasRunInTransaction,
  TUnitOfWork,
>(
  prisma: PrismaClient,
  buildUow: (client: PrismaClientLike) => TUnitOfWork,
): TRepo {
  const directUow = buildUow(prisma);
  return {
    ...directUow,
    runInTransaction<T>(operation: (uow: TUnitOfWork) => Promise<T>): Promise<T> {
      return prisma.$transaction(async (tx) => {
        const scopedUow = buildUow(tx);
        return operation(scopedUow);
      });
    },
  } as unknown as TRepo;
}
