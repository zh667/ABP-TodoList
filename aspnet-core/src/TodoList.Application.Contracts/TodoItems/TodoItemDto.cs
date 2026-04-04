using Volo.Abp.Application.Dtos;

namespace TodoList.TodoItems;

/// <summary>
/// DTO for returning todo item data to the client.
/// </summary>
public class TodoItemDto : AuditedEntityDto<int>
{
    public int UserId { get; set; }

    public string Title { get; set; } = string.Empty;

    public bool Completed { get; set; }
}
