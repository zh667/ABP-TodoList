import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { EnvironmentService } from '@abp/ng.core';

export interface TodoItemDto {
  id: number;
  userId: number;
  title: string;
  completed: boolean;
  creationTime: string;
  lastModificationTime?: string;
}

export interface CreateUpdateTodoItemDto {
  userId: number;
  title: string;
  completed: boolean;
}

export interface PagedResultDto<T> {
  totalCount: number;
  items: T[];
}

export interface PagedRequestDto {
  skipCount?: number;
  maxResultCount?: number;
  sorting?: string;
}

@Injectable({
  providedIn: 'root',
})
export class TodoItemService {
  private apiUrl: string;

  constructor(
    private http: HttpClient,
    private environment: EnvironmentService
  ) {
    this.apiUrl = this.environment.getEnvironment().apis?.default?.url + '/api/app/todo-item';
  }

  getList(params?: PagedRequestDto): Observable<PagedResultDto<TodoItemDto>> {
    let httpParams = new HttpParams();
    if (params?.skipCount != null) {
      httpParams = httpParams.set('SkipCount', params.skipCount.toString());
    }
    if (params?.maxResultCount != null) {
      httpParams = httpParams.set('MaxResultCount', params.maxResultCount.toString());
    }
    if (params?.sorting) {
      httpParams = httpParams.set('Sorting', params.sorting);
    }
    return this.http.get<PagedResultDto<TodoItemDto>>(this.apiUrl, { params: httpParams });
  }

  get(id: number): Observable<TodoItemDto> {
    return this.http.get<TodoItemDto>(`${this.apiUrl}/${id}`);
  }

  create(body: CreateUpdateTodoItemDto): Observable<TodoItemDto> {
    return this.http.post<TodoItemDto>(this.apiUrl, body);
  }

  update(id: number, body: CreateUpdateTodoItemDto): Observable<TodoItemDto> {
    return this.http.put<TodoItemDto>(`${this.apiUrl}/${id}`, body);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }
}
