using Volo.Abp.Application.Dtos;
using Volo.Abp.Application.Services;

namespace TodoList.TodoItems;

/// <summary>
/// Application service interface for TodoItem CRUD operations.
/// </summary>
public interface ITodoItemAppService :
    ICrudAppService<
        TodoItemDto,
        int,
        PagedAndSortedResultRequestDto,
        CreateUpdateTodoItemDto>
{
}
