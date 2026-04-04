import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Confirmation, ConfirmationService } from '@abp/ng.theme.shared';
import {
  TodoItemDto,
  CreateUpdateTodoItemDto,
  TodoItemService,
  PagedResultDto,
} from '@proxy/todo-items';

@Component({
  selector: 'app-todo-item-list',
  templateUrl: './todo-item-list.component.html',
  styleUrls: ['./todo-item-list.component.scss'],
})
export class TodoItemListComponent implements OnInit {
  todoItems: TodoItemDto[] = [];
  totalCount = 0;
  page = 1;
  pageSize = 10;
  isModalOpen = false;
  modalTitle = '';
  form!: FormGroup;
  selectedTodoItem: TodoItemDto | null = null;
  loading = false;
  searchText = '';
  isFormSubmitted = false;

  constructor(
    private todoItemService: TodoItemService,
    private fb: FormBuilder,
    private confirmation: ConfirmationService
  ) {}

  ngOnInit(): void {
    this.loadTodoItems();
  }

  loadTodoItems(): void {
    this.loading = true;
    const skipCount = (this.page - 1) * this.pageSize;
    this.todoItemService
      .getList({
        skipCount: 0,
        maxResultCount: 1000,
        sorting: 'id desc',
      })
      .subscribe({
        next: (result: PagedResultDto<TodoItemDto>) => {
          // Client-side search filtering
          let filtered = result.items;
          if (this.searchText.trim()) {
            const keyword = this.searchText.trim().toLowerCase();
            filtered = result.items.filter(item =>
              item.title.toLowerCase().includes(keyword)
            );
          }
          this.totalCount = filtered.length;

          // Client-side pagination
          const start = (this.page - 1) * this.pageSize;
          this.todoItems = filtered.slice(start, start + this.pageSize);
          this.loading = false;
        },
        error: () => {
          this.loading = false;
        },
      });
  }

  onSearch(): void {
    this.page = 1;
    this.loadTodoItems();
  }

  clearSearch(): void {
    this.searchText = '';
    this.page = 1;
    this.loadTodoItems();
  }

  onPageChange(page: number): void {
    this.page = page;
    this.loadTodoItems();
  }

  openCreateModal(): void {
    this.selectedTodoItem = null;
    this.modalTitle = '新建待办事项';
    this.isFormSubmitted = false;
    this.buildForm();
    this.isModalOpen = true;
  }

  openEditModal(item: TodoItemDto): void {
    this.selectedTodoItem = item;
    this.modalTitle = '编辑待办事项';
    this.isFormSubmitted = false;
    this.buildForm();
    this.isModalOpen = true;
  }

  buildForm(): void {
    this.form = this.fb.group({
      userId: [this.selectedTodoItem?.userId ?? 0],
      title: [this.selectedTodoItem?.title ?? '', [Validators.required, Validators.maxLength(256)]],
      completed: [this.selectedTodoItem?.completed ?? false],
    });
  }

  save(): void {
    this.isFormSubmitted = true;
    if (this.form.invalid) {
      return;
    }
    const body: CreateUpdateTodoItemDto = this.form.value;

    const request$ = this.selectedTodoItem
      ? this.todoItemService.update(this.selectedTodoItem.id, body)
      : this.todoItemService.create(body);

    request$.subscribe(() => {
      this.isModalOpen = false;
      this.isFormSubmitted = false;
      this.loadTodoItems();
    });
  }

  deleteTodoItem(item: TodoItemDto): void {
    this.confirmation
      .warn('确定要删除这个待办事项吗？', '确认删除')
      .subscribe((status: Confirmation.Status) => {
        if (status === Confirmation.Status.confirm) {
          this.todoItemService.delete(item.id).subscribe(() => {
            this.loadTodoItems();
          });
        }
      });
  }

  toggleCompleted(item: TodoItemDto): void {
    const body: CreateUpdateTodoItemDto = {
      userId: item.userId,
      title: item.title,
      completed: !item.completed,
    };
    this.todoItemService.update(item.id, body).subscribe(() => {
      this.loadTodoItems();
    });
  }
}
