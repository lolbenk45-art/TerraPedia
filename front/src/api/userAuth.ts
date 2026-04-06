import api from '@/api'
import type { ApiResponse, UserAuthResponse, UserProfile, UserRegisterCodeResponse } from '@/types'

export const sendRegisterCode = async (email: string): Promise<UserRegisterCodeResponse> => {
  const { data } = await api.post<ApiResponse<UserRegisterCodeResponse>>('/user-auth/register/code', { email })
  return data.data
}

export const sendPasswordResetCode = async (email: string): Promise<UserRegisterCodeResponse> => {
  const { data } = await api.post<ApiResponse<UserRegisterCodeResponse>>('/user-auth/password/reset/code', { email })
  return data.data
}

export const registerUser = async (payload: {
  email: string
  password: string
  verificationCode: string
  displayName?: string
}): Promise<UserAuthResponse> => {
  const { data } = await api.post<ApiResponse<UserAuthResponse>>('/user-auth/register', payload)
  return data.data
}

export const loginUser = async (payload: {
  email: string
  password: string
}): Promise<UserAuthResponse> => {
  const { data } = await api.post<ApiResponse<UserAuthResponse>>('/user-auth/login', payload)
  return data.data
}

export const fetchCurrentUser = async (): Promise<UserProfile> => {
  const { data } = await api.get<ApiResponse<UserProfile>>('/user-auth/me')
  return data.data
}

export const logoutUser = async (): Promise<void> => {
  await api.post('/user-auth/logout')
}

export const updateUserProfile = async (payload: { displayName: string }): Promise<UserProfile> => {
  const { data } = await api.patch<ApiResponse<UserProfile>>('/user-auth/profile', payload)
  return data.data
}

export const changeUserPassword = async (payload: { currentPassword: string; newPassword: string }): Promise<void> => {
  await api.patch('/user-auth/password', payload)
}

export const resetUserPassword = async (payload: {
  email: string
  verificationCode: string
  newPassword: string
}): Promise<void> => {
  await api.post('/user-auth/password/reset', payload)
}

export const deleteOwnAccount = async (payload: { currentPassword: string }): Promise<void> => {
  await api.delete('/user-auth/account', { data: payload })
}
