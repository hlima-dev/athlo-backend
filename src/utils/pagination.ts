import { Request } from 'express'

export interface PaginationParams {
  page: number
  limit: number
  skip: number
}

export interface PaginatedResponse<T> {
  data: T[]
  meta: {
    total: number
    page: number
    limit: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }
}

export function getPagination(req: Request): PaginationParams {
  const page = Math.max(1, Number(req.query.page) || 1)
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20))
  const skip = (page - 1) * limit
  return { page, limit, skip }
}

export function paginate<T>(
  data: T[],
  total: number,
  { page, limit }: PaginationParams,
): PaginatedResponse<T> {
  const totalPages = Math.ceil(total / limit)
  return {
    data,
    meta: {
      total,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  }
}

export function successResponse<T>(data: T, message?: string) {
  return {
    status: 'success',
    ...(message && { message }),
    data,
  }
}
