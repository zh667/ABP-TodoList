using Volo.Abp.Modularity;

namespace TodoList;

[DependsOn(
    typeof(TodoListDomainModule),
    typeof(TodoListTestBaseModule)
)]
public class TodoListDomainTestModule : AbpModule
{

}
