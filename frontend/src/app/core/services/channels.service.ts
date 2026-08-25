import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { API_BASE } from '../http/api.config';
import { CreateChannelRequest, NotificationChannel, UpdateChannelRequest } from '../models/channel.model';

@Injectable({ providedIn: 'root' })
export class ChannelsService {
  private readonly http = inject(HttpClient);

  list(): Promise<NotificationChannel[]> {
    return firstValueFrom(this.http.get<NotificationChannel[]>(`${API_BASE}/channels`));
  }

  create(request: CreateChannelRequest): Promise<NotificationChannel> {
    return firstValueFrom(this.http.post<NotificationChannel>(`${API_BASE}/channels`, request));
  }

  update(id: string, request: UpdateChannelRequest): Promise<NotificationChannel> {
    return firstValueFrom(this.http.put<NotificationChannel>(`${API_BASE}/channels/${id}`, request));
  }

  remove(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${API_BASE}/channels/${id}`));
  }
}
