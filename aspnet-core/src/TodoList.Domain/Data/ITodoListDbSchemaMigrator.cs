using System.Threading.Tasks;

namespace TodoList.Data;

public interface ITodoListDbSchemaMigrator
{
    Task MigrateAsync();
}
