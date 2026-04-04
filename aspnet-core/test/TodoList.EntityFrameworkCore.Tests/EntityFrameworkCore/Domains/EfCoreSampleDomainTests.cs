using TodoList.Samples;
using Xunit;

namespace TodoList.EntityFrameworkCore.Domains;

[Collection(TodoListTestConsts.CollectionDefinitionName)]
public class EfCoreSampleDomainTests : SampleDomainTests<TodoListEntityFrameworkCoreTestModule>
{

}
