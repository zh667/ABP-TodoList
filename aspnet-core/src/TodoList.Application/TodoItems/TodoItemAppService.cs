using System;
using Volo.Abp.Application.Dtos;
using Volo.Abp.Application.Services;
using Volo.Abp.Domain.Repositories;

namespace TodoList.TodoItems;

/// <summary>
/// Application service for TodoItem CRUD operations.
/// Inherits from CrudAppService to provide automatic CRUD implementation.
/// </summary>
public class TodoItemAppService :
    CrudAppService<
        TodoItem,
        TodoItemDto,
        int,
        PagedAndSortedResultRequestDto,
        CreateUpdateTodoItemDto>,
    ITodoItemAppService
{
    public TodoItemAppService(IRepository<TodoItem, int> repository)
        : base(repository)
    {
    }
}
